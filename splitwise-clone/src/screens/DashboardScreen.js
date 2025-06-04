import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledButton from '../components/StyledButton'; // Import StyledButton

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
  const [overallOwedToUser, setOverallOwedToUser] = useState(0);
  const [overallUserOwes, setOverallUserOwes] = useState(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(null); // Changed from currentUser object to just UID

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      // Handle user not logged in, e.g., navigate to Login
      navigation.navigate('Login');
    }
  }, [navigation]);

  const fetchDataAndBalances = useCallback(async () => {
    if (!currentUserUid) return;

    setIsLoadingBalances(true);
    setRefreshing(true);

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

  const renderExpenseItem = ({ item }) => (
    <View style={styles.itemCard}>
      <Text style={styles.itemDescription}>{item.description}</Text>
      <Text style={styles.itemAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Dashboard</Text>
      </View>

      <View style={styles.balanceOverviewCard}>
        {isLoadingBalances ? (
          <ActivityIndicator size="large" color={COLORS.primary} />
        ) : (
          <>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceTextLabel}>Overall, you are owed:</Text>
              <Text style={[styles.balanceTextValue, styles.positiveBalance]}>${overallOwedToUser.toFixed(2)}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceTextLabel}>Overall, you owe:</Text>
              <Text style={[styles.balanceTextValue, styles.negativeBalance]}>${overallUserOwes.toFixed(2)}</Text>
            </View>
            <View style={styles.netBalanceSeparator} />
            <View style={styles.balanceRow}>
              <Text style={styles.netBalanceLabel}>Net Balance:</Text>
              <Text style={[
                  styles.netBalanceValue,
                  (overallOwedToUser - overallUserOwes) >= 0 ? styles.positiveBalance : styles.negativeBalance
              ]}>
                {(overallOwedToUser - overallUserOwes) >= 0 ?
                  `You are owed $${(overallOwedToUser - overallUserOwes).toFixed(2)}` :
                  `You owe $${Math.abs(overallOwedToUser - overallUserOwes).toFixed(2)}`
                }
                {(overallOwedToUser - overallUserOwes) === 0 && "You are settled up!"}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.buttonGrid}>
        <StyledButton title="Add Expense" onPress={() => navigation.navigate('AddExpense')} type="primary" style={styles.gridButton} />
        <StyledButton title="My Groups" onPress={() => navigation.navigate('GroupsList')} type="primary" style={styles.gridButton} />
        <StyledButton title="Pending Invites" onPress={() => navigation.navigate('PendingInvitations')} type="primary" style={styles.gridButton} />
        <StyledButton title="Friends" onPress={() => navigation.navigate('Friends')} type="primary" style={styles.gridButton} />
        <StyledButton title="Recurring" onPress={() => navigation.navigate('RecurringExpensesList')} type="primary" style={styles.gridButton} />
      </View>

      <Text style={styles.sectionTitle}>Recent Personal Expenses</Text>
      {personalExpenses.length === 0 && !refreshing && !isLoadingBalances ? (
        <Text style={styles.noItemsText}>No personal expenses recorded yet.</Text>
      ) : (
        <FlatList
          data={personalExpenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]}/>}
          ListEmptyComponent={isLoadingBalances || refreshing ? <ActivityIndicator color={COLORS.primary} style={{marginTop:20}}/> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // ... (keep existing styles for container, header, buttons, list, itemCard, etc.)
  // Add new styles for balance overview
  balanceOverviewCard: {
    backgroundColor: COLORS.cardBackground,
    padding: 20,
    marginHorizontal: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  balanceTextLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  balanceTextValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  netBalanceSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  netBalanceLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  netBalanceValue: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  // Ensure other styles from previous version are here
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingTop: 40, // Adjust for status bar if needed
    paddingBottom: 20,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.cardBackground, // White text on primary bg
    textAlign: 'center',
  },
  balanceSummaryCard: { // Optional: if you add an overall balance
    backgroundColor: COLORS.cardBackground,
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  balanceLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },
  positiveBalance: { color: COLORS.accent },
  negativeBalance: { color: COLORS.danger },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Allow buttons to wrap
    justifyContent: 'space-between', // Distribute space
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  gridButton: {
    width: '48%', // Approximately two buttons per row with some space
    marginVertical: 5, // Add vertical margin for wrapped buttons
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  list: {
    paddingHorizontal: 15,
  },
  itemCard: {
    backgroundColor: COLORS.cardBackground,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemDescription: {
    fontSize: 16,
    color: COLORS.text,
    flexShrink: 1, // Allow text to shrink if too long
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  noItemsText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});

export default DashboardScreen;
