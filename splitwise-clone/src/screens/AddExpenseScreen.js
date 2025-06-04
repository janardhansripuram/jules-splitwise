import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { firebase } from '../../firebaseConfig'; // Import Firebase
import { Picker } from '@react-native-picker/picker';

function AddExpenseScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null); // null for personal expense

  useEffect(() => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login'); // Or handle appropriately
      return;
    }
    const currentUserUid = currentUser.uid;

    const unsubscribe = firebase.firestore().collection('groups')
      .where('members', 'array-contains', currentUserUid)
      .onSnapshot(querySnapshot => {
        const groupsArray = [];
        querySnapshot.forEach(documentSnapshot => {
          groupsArray.push({
            id: documentSnapshot.id,
            name: documentSnapshot.data().name, // Only need id and name for picker
          });
        });
        setUserGroups(groupsArray);
      }, error => {
        console.error("Error fetching user groups: ", error);
        Alert.alert("Error", "Could not fetch your groups.");
      });

    return () => unsubscribe(); // Unsubscribe on unmount
  }, [navigation]);

  const handleAddExpense = async () => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Authentication Error", "No user logged in.");
      return;
    }
    const currentUserUid = currentUser.uid;

    if (!description.trim() || !amount.trim()) {
      Alert.alert("Validation Error", "Both description and amount are required.");
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }

    let expenseData = {
      description: description,
      amount: numericAmount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      paidByUid: currentUserUid,
    };

    try {
      if (selectedGroupId && selectedGroupId !== "personal") {
        // Fetch group members for splitting
        const groupDoc = await firebase.firestore().collection('groups').doc(selectedGroupId).get();
        if (!groupDoc.exists) {
          Alert.alert("Error", "Selected group not found.");
          return;
        }
        const groupData = groupDoc.data();
        const members = groupData.members || [];
        if (members.length === 0) {
          Alert.alert("Error", "Selected group has no members to split with.");
          return;
        }

        expenseData = {
          ...expenseData,
          groupId: selectedGroupId,
          splitType: 'equal',
          involvedUids: members,
          amountPerMember: members.length > 0 ? numericAmount / members.length : numericAmount,
        };
        console.log('Adding group expense:', expenseData);
      } else {
        // Personal expense
        expenseData = {
          ...expenseData,
          splitType: 'personal',
          involvedUids: [currentUserUid], // Only involves the payer
        };
        console.log('Adding personal expense:', expenseData);
      }

      await firebase.firestore().collection('expenses').add(expenseData);

      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount.toFixed(2)}`);
      setDescription('');
      setAmount('');
      setSelectedGroupId(null); // Reset picker
      // navigation.goBack();
    } catch (error) {
      console.error("Error adding expense: ", error);
      Alert.alert("Error", "Could not add expense. Please try again. Details: " + error.message);
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
      <Text style={styles.label}>Share with Group (Optional):</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedGroupId}
          onValueChange={(itemValue) => setSelectedGroupId(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Personal Expense (None)" value="personal" />
          {userGroups.map(group => (
            <Picker.Item key={group.id} label={group.name} value={group.id} />
          ))}
        </Picker>
      </View>
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
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: '#f9f9f9',
  },
  picker: {
    height: 50, // Note: height might be needed for Android
    // Style further as needed
  },
});

export default AddExpenseScreen;
