import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { firebase } from '../../firebaseConfig';

function GroupDetailScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;
  const [groupExpenses, setGroupExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({ myTotalOwed: 0, totalOwedToMe: 0, netBalance: 0, settled: true });

  useEffect(() => {
    navigation.setOptions({ title: groupName }); // Set screen title to group name

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login');
      return;
    }
    const currentUserUid = currentUser.uid;

    const unsubscribeExpenses = firebase.firestore().collection('expenses')
      .where('groupId', '==', groupId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const expensesArray = [];
        let myOwed = 0;
        let owedToMe = 0;

        querySnapshot.forEach(documentSnapshot => {
          const expense = {
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          };
          expensesArray.push(expense);

          // Calculate balances
          if (expense.amountPerMember === undefined && expense.splitType === 'equal') {
            // Fallback if amountPerMember wasn't stored for some reason (should not happen with current AddExpenseScreen)
            console.warn("Expense missing amountPerMember, recalculating for balance display:", expense.id);
            const memberCount = expense.involvedUids ? expense.involvedUids.length : 1;
            expense.amountPerMember = memberCount > 0 ? expense.amount / memberCount : expense.amount;
          }


          if (expense.paidByUid === currentUserUid) {
            // I paid this expense
            // If amountPerMember is defined, I am owed (total amount - my share)
            // My share is expense.amountPerMember. Others owe me the rest.
            if (expense.involvedUids && expense.involvedUids.length > 1) {
                 owedToMe += expense.amount - (expense.amountPerMember || expense.amount / expense.involvedUids.length) ;
            }
          } else if (expense.involvedUids && expense.involvedUids.includes(currentUserUid)) {
            // Someone else paid, and I am involved in this expense
            myOwed += expense.amountPerMember || 0;
          }
        });

        setGroupExpenses(expensesArray);

        const net = owedToMe - myOwed;
        setBalances({
          myTotalOwed: myOwed,
          totalOwedToMe: owedToMe,
          netBalance: net,
          settled: Math.abs(net) < 0.01 // Consider settled if difference is less than 1 cent
        });
        setLoading(false);
      }, error => {
        console.error("Error fetching group expenses: ", error);
        Alert.alert("Error", "Could not fetch group expenses.");
        setLoading(false);
      });

    return () => unsubscribeExpenses();
  }, [groupId, groupName, navigation]);

  const renderExpenseItem = ({ item }) => (
    <View style={styles.expenseItem}>
      <View style={styles.expenseHeader}>
        <Text style={styles.expenseDescription}>{item.description}</Text>
        <Text style={styles.expenseAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
      </View>
      <Text style={styles.expensePaidBy}>Paid by: {item.paidByUid === firebase.auth().currentUser.uid ? "You" : `User ${item.paidByUid.substring(0,6)}...`}</Text>
      {item.splitType === 'equal' && item.involvedUids && (
        <Text style={styles.expenseSplit}>Split equally among {item.involvedUids.length} members (${(item.amountPerMember || 0).toFixed(2)} each)</Text>
      )}
       {/* Add more details as needed, e.g., who is involved */}
    </View>
  );

  const renderBalanceSummary = () => {
    let balanceText = "You are settled up in this group.";
    let balanceStyle = styles.settledText;

    if (!balances.settled) {
      if (balances.netBalance > 0) {
        balanceText = `Overall, you are owed: $${balances.netBalance.toFixed(2)}`;
        balanceStyle = styles.owedToMeText;
      } else {
        balanceText = `Overall, you owe: $${Math.abs(balances.netBalance).toFixed(2)}`;
        balanceStyle = styles.youOweText;
      }
    }
    return <Text style={[styles.balanceSummaryText, balanceStyle]}>{balanceText}</Text>;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text>Loading group details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.balanceContainer}>
        {renderBalanceSummary()}
      </View>

      <Text style={styles.expensesTitle}>Group Expenses:</Text>
      {groupExpenses.length === 0 ? (
        <Text style={styles.noExpensesText}>No expenses in this group yet.</Text>
      ) : (
        <FlatList
          data={groupExpenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          style={styles.list}
        />
      )}
       {/* Button to add expense to this specific group - can be added later */}
       {/* <Button title="Add Expense to this Group" onPress={() => navigation.navigate('AddExpense', { screen: 'AddExpense', params: { preselectedGroupId: groupId }})} /> */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#f9f9f9',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceContainer: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  balanceSummaryText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  settledText: {
    color: 'green',
  },
  owedToMeText: {
    color: 'green',
  },
  youOweText: {
    color: 'red',
  },
  expensesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  list: {
    // Styles for the list itself if needed
  },
  expenseItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '500',
    color: '#444',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
  expensePaidBy: {
    fontSize: 13,
    color: 'gray',
    marginBottom: 3,
  },
  expenseSplit: {
    fontSize: 13,
    color: 'dimgray',
  },
  noExpensesText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: 'gray',
  },
});

export default GroupDetailScreen;
