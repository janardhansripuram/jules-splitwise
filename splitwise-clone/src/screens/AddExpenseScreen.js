import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { firebase } from '../../firebaseConfig'; // Import Firebase

function AddExpenseScreen({ navigation }) { // Added navigation for potential future use
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const handleAddExpense = async () => {
    if (!description.trim() || !amount.trim()) {
      Alert.alert("Validation Error", "Both description and amount are required.");
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }

    try {
      await firebase.firestore().collection('expenses').add({
        description: description,
        amount: numericAmount,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      console.log('Expense added to Firebase successfully!');
      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount}`);
      setDescription('');
      setAmount('');
      // Optionally navigate back or to another screen
      // navigation.goBack();
    } catch (error) {
      console.error("Error adding expense to Firebase: ", error);
      Alert.alert("Error", "Could not add expense. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Description:</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter expense description"
        value={description}
        onChangeText={setDescription}
      />
      <Text style={styles.label}>Amount:</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter expense amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />
      <Button title="Add Expense" onPress={handleAddExpense} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
  },
});

export default AddExpenseScreen;
