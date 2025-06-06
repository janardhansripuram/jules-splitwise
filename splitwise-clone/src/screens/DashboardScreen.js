import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Button as PaperButton, Text as PaperText, Card as PaperCard, ActivityIndicator as PaperActivityIndicator, useTheme, MD3Colors } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const COLORS = {
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#212529',
  textSecondary: '#6c757d',
  primary: '#007bff',
  accent: '#28a745', // For positive balance
  danger: '#dc3545', // For negative balance
  border: '#ced4da',
};

function DashboardScreen({ navigation }) {
  const [personalExpenses, setPersonalExpenses] = useState([]);
  // const [userOverallBalance, setUserOverallBalance] = useState(0); // Replaced by specific states
// Import balance utilities if they are not already imported (assuming they are used)
import { calculateNetBalance, calculateUserShareInExpense } from '../utils/balanceUtils';
import { generateDueExpenses } from '../utils/recurringExpenseManager'; // Corrected import

// Removed COLORS constant, will use theme from useTheme()

function DashboardScreen({ navigation }) {
  const theme = useTheme(); // theme is already used
  const [personalExpenses, setPersonalExpenses] = useState([]);
  const [overallOwedToUser, setOverallOwedToUser] = useState(0);
  const [overallUserOwes, setOverallUserOwes] = useState(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);
  const [isProcessingRecurringExpenses, setIsProcessingRecurringExpenses] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(null);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      navigation.navigate('Login');
    }
  }, [navigation]);

  const fetchDataAndBalances = useCallback(async () => {
    if (!currentUserUid) return;
    setRefreshing(true);
    // We can set isLoadingBalances true here if this is the primary data load point
    // For recurring expenses, it has its own flag, but balances need this.
    setIsLoadingBalances(true);

    let tempOwedToUser = 0;
    let tempUserOwes = 0;

    try {
      // 1. Fetch groups user is a member of
      const groupsSnapshot = await firebase.firestore().collection('groups')
        .where('members', 'array-contains', { uid: currentUserUid, status: 'accepted', email: firebase.auth().currentUser.email }) // Ensure email matches too for safety
        .get();

      for (const groupDoc of groupsSnapshot.docs) {
        const groupId = groupDoc.id;
        const groupExpensesSnapshot = await firebase.firestore().collection('expenses')
          .where('groupId', '==', groupId).get();
        const groupExpenses = groupExpensesSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        const groupSettlementsSnapshot = await firebase.firestore().collection('settlements')
          .where('groupId', '==', groupId).get();
        const groupSettlements = groupSettlementsSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        const groupNetBalance = calculateNetBalance(groupExpenses, groupSettlements, currentUserUid);
        if (groupNetBalance > 0) {
          tempOwedToUser += groupNetBalance;
        } else if (groupNetBalance < 0) {
          tempUserOwes += Math.abs(groupNetBalance);
        }
      }

      // 2. Fetch and process personal expenses
      const personalExpensesQuery = firebase.firestore().collection('expenses').where('groupId', '==', null);

      // Expenses paid by user (potentially owed to user by others if split)
      const paidByMeSnapshot = await personalExpensesQuery.where('paidByUid', '==', currentUserUid).get();
      paidByMeSnapshot.forEach(doc => {
        const expense = { ...doc.data(), id: doc.id };
        // If personal expense is split, this logic needs to be robust
        // Assuming personal expenses paid by user are fully their cost unless explicitly split with others
        // For this example, if paidByUid is currentUserUid and it's a personal expense, it doesn't automatically mean others owe them.
        // This part would need a concept of "splitting with friends" outside groups.
        // Simplified: personal expenses paid by user don't contribute to "owedToUser" unless structure supports it.
        // However, if it was itemized/exact and involved others (even if not a group), it could.
        // For now, this is a simplification:
        if (expense.splitType && expense.splitType !== 'personal' && expense.memberOwes) { // e.g. exact split with non-group members
            const myShare = calculateUserShareInExpense(expense, currentUserUid);
            tempOwedToUser += (expense.amount - myShare);
        }
      });

      // Expenses paid by others where user is involved
      // This requires querying for involvement. Firestore doesn't directly support 'OR' in array-contains or memberOwes field.
      // This part is complex for personal expenses without a clear "friends" structure.
      // A simplified approach: fetch all personal expenses and filter client-side.
      const allPersonalExpensesSnapshot = await personalExpensesQuery.get();
      allPersonalExpensesSnapshot.forEach(doc => {
          const expense = { ...doc.data(), id: doc.id };
          if (expense.paidByUid !== currentUserUid) {
              const userShare = calculateUserShareInExpense(expense, currentUserUid);
              if (userShare > 0) {
                  tempUserOwes += userShare;
              }
          }
      });

      // Also fetch personal expenses to display (those user paid for and are purely personal)
      const personalExpensesForDisplaySnapshot = await personalExpensesQuery
        .where('paidByUid', '==', currentUserUid)
        // .where('splitType', '==', 'personal') // Or however you define purely personal ones
        .orderBy('createdAt', 'desc')
        .get();
      setPersonalExpenses(personalExpensesForDisplaySnapshot.docs.map(d => ({ ...d.data(), id: d.id })));


      setOverallOwedToUser(tempOwedToUser);
      setOverallUserOwes(tempUserOwes);

    } catch (error) {
      console.error("Error fetching dashboard balances: ", error);
      Alert.alert("Error", "Could not calculate all balances.");
    } finally {
      setIsLoadingBalances(false);
      setRefreshing(false);
    }
  }, [currentUserUid]);

  useEffect(() => {
    if (currentUserUid) {
      fetchDataAndBalances();
    }
  }, [currentUserUid, fetchDataAndBalances]);


  const onRefresh = () => {
    fetchDataAndBalances();
  };

  // useEffect for Recurring Expense Generation (logic remains largely the same, ensure generateDueExpenses is imported correctly)
  useEffect(() => {
    const runRecurringExpenseGeneration = async () => {
      if (isProcessingRecurringExpenses || !currentUserUid) return;
      setIsProcessingRecurringExpenses(true);
      try {
        const templatesSnapshot = await firebase.firestore().collection('recurringExpenses')
          .where('userId', '==', currentUserUid).where('isActive', '==', true).get();
        const templates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (templates.length > 0) {
          const batch = firebase.firestore().batch();
          const generatedCount = await generateDueExpenses(currentUserUid, templates, batch); // Ensure this utility is correctly imported
          if (generatedCount > 0) {
            await batch.commit();
            if (fetchDataAndBalances) fetchDataAndBalances();
          }
        }
      } catch (error) { console.error("Dashboard: Error processing recurring expenses: ", error); }
      finally { setIsProcessingRecurringExpenses(false); }
    };
    if (currentUserUid) runRecurringExpenseGeneration();
  }, [currentUserUid, fetchDataAndBalances, isProcessingRecurringExpenses]); // Added isProcessingRecurringExpenses and fetchDataAndBalances to deps


  const onRefresh = fetchDataAndBalances; // Simplified onRefresh

  const renderExpenseItem = ({ item }) => (
    <PaperCard style={styles.itemCard} elevation={1}>
      <PaperCard.Content style={styles.itemCardContent}>
        <View style={styles.itemDetails}>
          {item.recurringExpenseId && (
            <MaterialCommunityIcons name="update" size={18} color={theme.colors.onSurfaceVariant} style={styles.recurringIcon} />
          )}
          <PaperText variant="bodyLarge" style={styles.itemDescription} numberOfLines={1}>{item.description}</PaperText>
        </View>
        <PaperText variant="bodyLarge" style={[styles.itemAmount, {color: theme.colors.primary}]}>${item.amount ? item.amount.toFixed(2) : '0.00'}</PaperText>
      </PaperCard.Content>
    </PaperCard>
  );

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      {/* Header with a slightly more prominent background from theme, or surface for standard look */}
      <View style={[styles.headerContainer, {backgroundColor: theme.colors.surfaceVariant /* or theme.colors.primary */}]}>
        <PaperText variant="headlineMedium" style={[styles.headerTitle, {color: theme.colors.onSurfaceVariant /* or theme.colors.onPrimary */}]}>Dashboard</PaperText>
      </View>

      <PaperCard style={styles.balanceOverviewCard} elevation={2}>
        <PaperCard.Title title="Financial Overview" titleVariant="titleLarge" titleStyle={{color: theme.colors.onSurface}}/>
        <PaperCard.Content>
          {isLoadingBalances ? (
            <PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" style={{marginVertical:20}}/>
          ) : (
            <>
              <View style={styles.balanceRow}>
                <PaperText variant="titleMedium">Overall, you are owed:</PaperText>
                <PaperText variant="titleMedium" style={{color: theme.colors.customSuccess || MD3Colors.green600}}>${overallOwedToUser.toFixed(2)}</PaperText>
              </View>
              <View style={styles.balanceRow}>
                <PaperText variant="titleMedium">Overall, you owe:</PaperText>
                <PaperText variant="titleMedium" style={{color: theme.colors.error}}>${overallUserOwes.toFixed(2)}</PaperText>
              </View>
              <View style={styles.netBalanceSeparator} />
              <View style={styles.balanceRow}>
                <PaperText variant="titleLarge">Net Balance:</PaperText>
                <PaperText variant="titleLarge" style={{ color: (overallOwedToUser - overallUserOwes) >= 0 ? (theme.colors.customSuccess || MD3Colors.green600) : theme.colors.error }}>
                  {(overallOwedToUser - overallUserOwes) >= 0 ?
                    `You are owed $${(overallOwedToUser - overallUserOwes).toFixed(2)}` :
                    `You owe $${Math.abs(overallOwedToUser - overallUserOwes).toFixed(2)}`
                  }
                  {(overallOwedToUser - overallUserOwes) === 0 && "You are settled up!"}
                </PaperText>
              </View>
            </>
          )}
        </PaperCard.Content>
      </PaperCard>

      <View style={styles.buttonGrid}>
        <PaperButton mode="contained" onPress={() => navigation.navigate('AddExpense')} style={styles.gridButton} labelStyle={styles.gridButtonLabel}>Add Expense</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('GroupsList')} style={styles.gridButton} labelStyle={styles.gridButtonLabel}>My Groups</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('PendingInvitations')} style={styles.gridButton} labelStyle={styles.gridButtonLabel}>Invites</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('Friends')} style={styles.gridButton} labelStyle={styles.gridButtonLabel}>Friends</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('RecurringExpensesList')} style={styles.gridButton} labelStyle={styles.gridButtonLabel}>Recurring</PaperButton>
      </View>

      <PaperText variant="titleLarge" style={[styles.sectionTitle, {color: theme.colors.onBackground}]}>Recent Personal Expenses</PaperText>
      {isLoadingBalances && personalExpenses.length === 0 && !refreshing ? null :
        personalExpenses.length === 0 && !refreshing ? (
        <PaperText style={[styles.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No personal expenses recorded yet.</PaperText>
      ) : (
        <FlatList
          data={personalExpenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          style={styles.list}
          contentContainerStyle={{paddingBottom:20}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
          ListEmptyComponent={isLoadingBalances || refreshing ? <PaperActivityIndicator color={theme.colors.primary} style={{marginTop:20}}/> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, /* backgroundColor from theme */ },
  headerContainer: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 20, marginBottom: 15, }, // Adjusted paddingTop
  headerTitle: { textAlign: 'center', fontWeight:'bold' },
  balanceOverviewCard: { marginHorizontal: 15, marginBottom: 20, },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, },
  netBalanceSeparator: { height: 1, /* backgroundColor from theme.colors.outlineVariant */ marginVertical: 12, },
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 10, marginBottom: 20, },
  gridButton: { width: '48%', marginVertical: 6, borderRadius: theme.roundness * 1.5 }, // Example of using theme roundness
  gridButtonLabel: { fontSize: 13, paddingVertical:2 },
  sectionTitle: { marginHorizontal: 20, marginBottom: 12, marginTop:10, fontWeight:'bold'},
  list: { paddingHorizontal: 15, },
  itemCard: { marginBottom: 10, borderWidth:0, borderRadius: theme.roundness }, // Using PaperCard elevation and theme roundness
  itemCardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal:16 },
  itemDetails: { flexDirection: 'row', alignItems: 'center', flexShrink:1, marginRight:8 },
  recurringIcon: { marginRight: 10, /* color from theme.colors.onSurfaceVariant */ },
  itemDescription: { flexShrink: 1, /* color from theme.colors.onSurface */ },
  itemAmount: { fontWeight: 'bold', /* color from theme.colors.primary */ },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 16, /* color from theme.colors.onSurfaceVariant */ },
});

export default DashboardScreen;
