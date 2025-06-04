import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert } from 'react-native';
import { firebase } from '../../firebaseConfig'; // Adjust path as necessary

function DashboardScreen({ navigation }) {
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    const unsubscribe = firebase.firestore().collection('expenses')
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const expensesArray = [];
        querySnapshot.forEach(documentSnapshot => {
          expensesArray.push({
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          });
        });
        setExpenses(expensesArray);
      }, error => {
        console.error("Error fetching expenses: ", error);
        Alert.alert("Error", "Could not fetch expenses.");
      });

    // Unsubscribe from snapshot listener when component unmounts
    return () => unsubscribe();
  }, []);

  const renderExpenseItem = ({ item }) => (
    <View style={styles.expenseItem}>
      <Text style={styles.expenseDescription}>{item.description}</Text>
      <Text style={styles.expenseAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.buttonContainer}>
        <Button
          title="Add New Expense"
          onPress={() => navigation.navigate('AddExpense')}
        />
        <View style={styles.buttonSpacer} />
        <Button
          title="View My Groups"
          onPress={() => navigation.navigate('GroupsList')}
        />
        <View style={styles.buttonSpacer} />
        <Button
          title="Pending Invites"
          onPress={() => navigation.navigate('PendingInvitations')}
          color="#ff8c00" // Example: Orange color for invites
        />
      </View>
      {expenses.length === 0 ? (
        <Text style={styles.noExpensesText}>No personal expenses yet. Add one, check groups, or view invites!</Text>
      ) : (
        <FlatList
          data={expenses}
          renderItem={renderExpenseItem}
          keyExtractor={item => item.id}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  buttonSpacer: {
    width: 10, // Adds space between buttons
  },
  list: {
    marginTop: 10, // Adjusted margin
  },
  expenseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
    marginBottom: 5,
    borderRadius: 5,
  },
  expenseDescription: {
    fontSize: 16,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  noExpensesText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 18,
    color: 'gray',
  },
});

export default DashboardScreen;
