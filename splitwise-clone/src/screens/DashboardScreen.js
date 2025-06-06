import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, RefreshControl, ActivityIndicator as RNActivityIndicator } from 'react-native'; // Use RN ActivityIndicator as fallback if Paper one has issues in style block
import { firebase } from '../../firebaseConfig';
import {
    Button as PaperButton,
    Text as PaperText,
    Card as PaperCard,
    ActivityIndicator as PaperActivityIndicator,
    useTheme,
    MD3Colors
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { calculateNetBalance, calculateUserShareInExpense } from '../utils/balanceUtils';
import { generateDueExpenses } from '../utils/recurringExpenseManager';

function DashboardScreen({ navigation }) {
  const theme = useTheme(); // Placed at the top of the component
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
    setIsLoadingBalances(true);

    let tempOwedToUser = 0;
    let tempUserOwes = 0;

    try {
      const groupsSnapshot = await firebase.firestore().collection('groups')
        .where('members', 'array-contains', { uid: currentUserUid, status: 'accepted', email: firebase.auth().currentUser.email })
        .get();

      for (const groupDoc of groupsSnapshot.docs) {
        const groupId = groupDoc.id;
        const groupExpensesSnapshot = await firebase.firestore().collection('expenses')
          .where('groupId', '==', groupId).get();
        const groupExpensesData = groupExpensesSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        const groupSettlementsSnapshot = await firebase.firestore().collection('settlements')
          .where('groupId', '==', groupId).get();
        const groupSettlementsData = groupSettlementsSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

        const groupNetBalance = calculateNetBalance(groupExpensesData, groupSettlementsData, currentUserUid);
        if (groupNetBalance > 0) {
          tempOwedToUser += groupNetBalance;
        } else if (groupNetBalance < 0) {
          tempUserOwes += Math.abs(groupNetBalance);
        }
      }

      const personalExpensesQuery = firebase.firestore().collection('expenses').where('groupId', '==', null);
      const paidByMeSnapshot = await personalExpensesQuery.where('paidByUid', '==', currentUserUid).get();
      paidByMeSnapshot.forEach(doc => {
        const expense = { ...doc.data(), id: doc.id };
        if (expense.splitType && expense.splitType !== 'personal_solo' && expense.splitType !== 'personal' && (expense.memberOwes || expense.involvedUids?.length > 1)) {
            const myShare = calculateUserShareInExpense(expense, currentUserUid);
            if(expense.amount - myShare > 0) tempOwedToUser += (expense.amount - myShare);
        }
      });

      const allPersonalExpensesSnapshot = await personalExpensesQuery.get();
      allPersonalExpensesSnapshot.forEach(doc => {
          const expense = { ...doc.data(), id: doc.id };
          if (expense.paidByUid !== currentUserUid) {
              const userShare = calculateUserShareInExpense(expense, currentUserUid);
              if (userShare > 0) tempUserOwes += userShare;
          }
      });

      const personalExpensesForDisplaySnapshot = await firebase.firestore().collection('expenses')
        .where('groupId', '==', null) // Personal expenses
        .where('paidByUid', '==', currentUserUid) // Typically, user wants to see expenses they initiated or are primary on
        // Further filtering might be needed if personal expenses can be "paid by others for me"
        .orderBy('createdAt', 'desc')
        .get();
      setPersonalExpenses(personalExpensesForDisplaySnapshot.docs.map(d => ({ ...d.data(), id: d.id })));

      setOverallOwedToUser(parseFloat(tempOwedToUser.toFixed(2)));
      setOverallUserOwes(parseFloat(tempUserOwes.toFixed(2)));

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
          const generatedCount = await generateDueExpenses(currentUserUid, templates, batch);
          if (generatedCount > 0) {
            await batch.commit();
            if (fetchDataAndBalances) fetchDataAndBalances();
          }
        }
      } catch (error) { console.error("Dashboard: Error processing recurring expenses: ", error); }
      finally { setIsProcessingRecurringExpenses(false); }
    };
    if (currentUserUid) runRecurringExpenseGeneration();
  }, [currentUserUid, fetchDataAndBalances, isProcessingRecurringExpenses]);

  const onRefresh = fetchDataAndBalances;

  const renderExpenseItem = ({ item }) => (
    <PaperCard style={[styles.itemCard, {borderColor: theme.colors.outline, borderRadius: theme.roundness }]} elevation={1}>
      <PaperCard.Content style={styles.itemCardContent}>
        <View style={styles.itemDetails}>
          {item.recurringExpenseId && (
            <MaterialCommunityIcons name="update" size={18} color={theme.colors.onSurfaceVariant} style={styles.recurringIcon} />
          )}
          <PaperText variant="bodyLarge" style={[styles.itemDescription, {color: theme.colors.onSurface}]} numberOfLines={1}>{item.description}</PaperText>
        </View>
        <PaperText variant="bodyLarge" style={[styles.itemAmount, {color: theme.colors.primary}]}>${item.amount ? item.amount.toFixed(2) : '0.00'}</PaperText>
      </PaperCard.Content>
    </PaperCard>
  );

  // Define styles inside component or pass theme to a function if preferred for StyleSheet.create
  // For simplicity, direct theme usage in JSX for dynamic parts, and StyleSheet for static parts.
  const styles = getStyles(theme);

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <View style={[styles.headerContainer, {backgroundColor: theme.colors.surfaceVariant}]}>
        <PaperText variant="headlineMedium" style={[styles.headerTitle, {color: theme.colors.onSurfaceVariant}]}>Dashboard</PaperText>
      </View>

      <PaperCard style={[styles.balanceOverviewCard, {backgroundColor: theme.colors.surface}]} elevation={2}>
        <PaperCard.Title title="Financial Overview" titleVariant="titleLarge" titleStyle={{color: theme.colors.onSurface}}/>
        <PaperCard.Content>
          {isLoadingBalances ? (
            <PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" style={{marginVertical:20}}/>
          ) : (
            <>
              <View style={styles.balanceRow}>
                <PaperText variant="titleMedium" style={{color: theme.colors.onSurfaceVariant}}>Overall, you are owed:</PaperText>
                <PaperText variant="titleMedium" style={{color: theme.colors.customSuccess || MD3Colors.green600}}>${overallOwedToUser.toFixed(2)}</PaperText>
              </View>
              <View style={styles.balanceRow}>
                <PaperText variant="titleMedium" style={{color: theme.colors.onSurfaceVariant}}>Overall, you owe:</PaperText>
                <PaperText variant="titleMedium" style={{color: theme.colors.error}}>${overallUserOwes.toFixed(2)}</PaperText>
              </View>
              <View style={[styles.netBalanceSeparator, {backgroundColor: theme.colors.outlineVariant}]} />
              <View style={styles.balanceRow}>
                <PaperText variant="titleLarge" style={{color:theme.colors.onSurface}}>Net Balance:</PaperText>
                <PaperText variant="titleLarge" style={{ color: (overallOwedToUser - overallUserOwes) >= 0 ? (theme.colors.customSuccess || MD3Colors.green600) : theme.colors.error }}>
                  {(overallOwedToUser - overallUserOwes) >= 0 ?
                    `You are owed $${(overallOwedToUser - overallUserOwes).toFixed(2)}` :
                    `You owe $${Math.abs(overallOwedToUser - overallUserOwes).toFixed(2)}`
                  }
                  {(Math.abs(overallOwedToUser - overallUserOwes) < 0.01) && "You are settled up!"}
                </PaperText>
              </View>
            </>
          )}
        </PaperCard.Content>
      </PaperCard>

      <View style={styles.buttonGrid}>
        <PaperButton mode="contained" onPress={() => navigation.navigate('AddExpense')} style={[styles.gridButton, {borderRadius: theme.roundness * 1.5}]} labelStyle={styles.gridButtonLabel}>Add Expense</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('GroupsList')} style={[styles.gridButton, {borderRadius: theme.roundness * 1.5}]} labelStyle={styles.gridButtonLabel}>My Groups</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('PendingInvitations')} style={[styles.gridButton, {borderRadius: theme.roundness * 1.5}]} labelStyle={styles.gridButtonLabel}>Invites</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('Friends')} style={[styles.gridButton, {borderRadius: theme.roundness * 1.5}]} labelStyle={styles.gridButtonLabel}>Friends</PaperButton>
        <PaperButton mode="contained" onPress={() => navigation.navigate('RecurringExpensesList')} style={[styles.gridButton, {borderRadius: theme.roundness * 1.5}]} labelStyle={styles.gridButtonLabel}>Recurring</PaperButton>
      </View>

      <PaperText variant="titleLarge" style={[styles.sectionTitle, {color: theme.colors.onBackground}]}>Recent Personal Expenses</PaperText>
      {(isLoadingBalances && personalExpenses.length === 0 && !refreshing) ? (
         <PaperActivityIndicator color={theme.colors.primary} style={{marginTop:20}}/>
      ): personalExpenses.length === 0 && !refreshing ? (
        <PaperText style={[styles.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No personal expenses recorded yet.</PaperText>
      ) : (
        <FlatList
          data={personalExpenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          style={styles.list}
          contentContainerStyle={{paddingBottom:20}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
          ListEmptyComponent={ (isLoadingBalances || refreshing) && personalExpenses.length === 0 ? <PaperActivityIndicator color={theme.colors.primary} style={{marginTop:20}}/> : null}
        />
      )}
    </View>
  );
}

// Styles function that accepts theme
const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, },
  headerContainer: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 20, marginBottom: 15, },
  headerTitle: { textAlign: 'center', fontWeight:'bold' },
  balanceOverviewCard: { marginHorizontal: 15, marginBottom: 20, backgroundColor: theme.colors.surface },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, },
  netBalanceSeparator: { height: 1, marginVertical: 12, backgroundColor: theme.colors.outlineVariant},
  buttonGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingHorizontal: 10, marginBottom: 20, },
  gridButton: { width: '48%', marginVertical: 6, }, // borderRadius applied inline using theme.roundness
  gridButtonLabel: { fontSize: 13, paddingVertical:2 },
  sectionTitle: { marginHorizontal: 20, marginBottom: 12, marginTop:10, fontWeight:'bold'},
  list: { paddingHorizontal: 15, },
  itemCard: { marginBottom: 10, borderWidth:0, backgroundColor: theme.colors.surface }, // Using PaperCard elevation and theme roundness
  itemCardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal:16 },
  itemDetails: { flexDirection: 'row', alignItems: 'center', flexShrink:1, marginRight:8 },
  recurringIcon: { marginRight: 10, },
  itemDescription: { flexShrink: 1, },
  itemAmount: { fontWeight: 'bold', },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 16, },
});

export default DashboardScreen;
