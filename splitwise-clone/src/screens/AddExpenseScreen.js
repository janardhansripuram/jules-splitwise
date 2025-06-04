import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Picker } from '@react-native-picker/picker';
import { RadioButton } from 'react-native-paper'; // Assuming this is or will be installed
import { fetchUsernames } from '../utils/userUtils'; // Import fetchUsernames


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
            name: documentSnapshot.data().name,
          });
        });
        setUserGroups(groupsArray);
      }, error => {
        console.error("Error fetching user groups: ", error);
        // Alert.alert("Error", "Could not fetch your groups."); // Can be noisy
      });
    return () => unsubscribe();
  }, [navigation]);

function AddExpenseScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("personal");
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null); // { ..., members: [{uid, email, name(from map)}]}
  const [usernamesMap, setUsernamesMap] = useState({});

  const [splitMethod, setSplitMethod] = useState('equal');
  const [exactAmounts, setExactAmounts] = useState({});
  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);

  // Fetch user's groups for the picker
  useEffect(() => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) { navigation.navigate('Login'); return; }
    const unsubscribe = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: currentUser.uid, status: 'accepted', email: currentUser.email }) // More specific query
      .onSnapshot(querySnapshot => {
        const groupsArray = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setUserGroups(groupsArray);
      }, error => console.error("Error fetching user groups: ", error));
    return () => unsubscribe();
  }, [navigation]);

  // Effect to fetch details (including member UIDs and then their names) of the selected group if split is 'exact'
  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== "personal" && splitMethod === 'exact') {
      setLoadingGroupDetails(true);
      setSelectedGroupDetails(null); // Clear previous details
      setExactAmounts({}); // Clear previous amounts

      const groupRef = firebase.firestore().collection('groups').doc(selectedGroupId);
      groupRef.get().then(async (doc) => { // Made async to await fetchUsernames
        if (doc.exists) {
          const groupData = doc.data();
          const acceptedMembersRaw = groupData.members.filter(m => m.status === 'accepted');
          const memberUids = acceptedMembersRaw.map(m => m.uid);

          if (memberUids.length > 0) {
            const namesMap = await fetchUsernames(memberUids);
            setUsernamesMap(prevMap => ({ ...prevMap, ...namesMap })); // Merge with existing map

            const acceptedMembersWithNames = acceptedMembersRaw.map(m => ({
              ...m,
              name: namesMap[m.uid] || m.email, // Fallback to email if name not found
            }));
            setSelectedGroupDetails({ ...groupData, id: doc.id, members: acceptedMembersWithNames });

            const initialExactAmounts = {};
            acceptedMembersWithNames.forEach(m => initialExactAmounts[m.uid] = '');
            setExactAmounts(initialExactAmounts);
          } else {
            setSelectedGroupDetails({ ...groupData, id: doc.id, members: [] }); // Group with no accepted members
          }
        } else {
          Alert.alert("Error", "Selected group details not found.");
        }
        setLoadingGroupDetails(false);
      }).catch(error => {
        console.error("Error fetching selected group details: ", error);
        Alert.alert("Error", "Could not fetch details for the selected group.");
        setLoadingGroupDetails(false);
      });
    } else {
      setSelectedGroupDetails(null);
      setExactAmounts({});
    }
  }, [selectedGroupId, splitMethod]);

  const handleExactAmountChange = (uid, value) => {
    setExactAmounts(prev => ({ ...prev, [uid]: value }));
  };

  const validateExactAmounts = (totalExpenseAmount) => {
    let sumOfExactAmounts = 0;
    for (const uid in exactAmounts) {
      const val = parseFloat(exactAmounts[uid] || 0);
      if (isNaN(val) || val < 0) {
        Alert.alert("Validation Error", `Invalid amount entered for a member. Please enter positive numbers.`);
        return false;
      }
      sumOfExactAmounts += val;
    }
    if (Math.abs(sumOfExactAmounts - totalExpenseAmount) > 0.01) { // Using a small tolerance for float comparison
      Alert.alert("Validation Error", `The sum of individual amounts ($${sumOfExactAmounts.toFixed(2)}) must equal the total expense amount ($${totalExpenseAmount.toFixed(2)}).`);
      return false;
    }
    return true;
  };

  const handleAddExpense = async () => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) { Alert.alert("Authentication Error", "No user logged in."); return; }
    const currentUserUid = currentUser.uid;

    if (!description.trim() || !amount.trim()) {
      Alert.alert("Validation Error", "Description and amount are required.");
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
        // Group Expense
        if (!selectedGroupDetails || selectedGroupDetails.id !== selectedGroupId) {
            // This might happen if details are still loading or failed.
            // Attempt to fetch details again or show error. For now, error out.
            Alert.alert("Error", "Group details not fully loaded. Please wait or re-select the group.");
            return;
        }
        const acceptedMembers = selectedGroupDetails.members.filter(m => m.status === 'accepted');
        if (acceptedMembers.length === 0) {
          Alert.alert("Error", "Selected group has no accepted members to split with.");
          return;
        }

        if (splitMethod === 'equal') {
          expenseData = {
            ...expenseData,
            groupId: selectedGroupId,
            splitType: 'equal',
            involvedUids: acceptedMembers.map(m => m.uid),
            amountPerMember: acceptedMembers.length > 0 ? numericAmount / acceptedMembers.length : numericAmount,
          };
        } else { // splitMethod === 'exact'
          if (!validateExactAmounts(numericAmount)) return; // Validation failed

          const memberOwes = {};
          const involvedUidsExact = [];
          acceptedMembers.forEach(member => {
            const owesAmount = parseFloat(exactAmounts[member.uid] || 0);
            if (owesAmount > 0) { // Only include if they owe something
              memberOwes[member.uid] = owesAmount;
              involvedUidsExact.push(member.uid);
            } else { // Ensure even zero amounts are recorded if they were part of the input form
                 memberOwes[member.uid] = 0;
            }
          });
           if (involvedUidsExact.length === 0 && numericAmount > 0) {
             Alert.alert("Error", "For exact split, at least one member must owe an amount if total is not zero.");
             return;
           }


          expenseData = {
            ...expenseData,
            groupId: selectedGroupId,
            splitType: 'exact',
            involvedUids: involvedUidsExact, // UIDs of members who owe something
            memberOwes: memberOwes, // Object {uid: amount, uid: amount}
          };
        }
        console.log('Adding group expense:', expenseData);
      } else {
        // Personal Expense
        expenseData = {
          ...expenseData,
          splitType: 'personal',
          involvedUids: [currentUserUid],
        };
        console.log('Adding personal expense:', expenseData);
      }

      await firebase.firestore().collection('expenses').add(expenseData);

      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount.toFixed(2)}`);
      setDescription('');
      setAmount('');
      setSelectedGroupId("personal");
      setSplitMethod('equal');
      setExactAmounts({});
      setSelectedGroupDetails(null);
      // navigation.goBack();
    } catch (error) {
      console.error("Error adding expense: ", error);
      Alert.alert("Error", "Could not add expense. Details: " + error.message);
    }
  };

  // Render exact amount inputs
  const renderExactAmountInputs = () => {
    if (loadingGroupDetails) return <ActivityIndicator size="small" color="#007bff" style={{marginVertical: 10}}/>;
    // Ensure selectedGroupDetails and its members array are populated
    if (!selectedGroupDetails || !selectedGroupDetails.members || selectedGroupDetails.members.length === 0 || splitMethod !== 'exact') {
      return splitMethod === 'exact' ? <Text style={styles.infoText}>Select a group with members to split by exact amounts.</Text> : null;
    }

    return selectedGroupDetails.members.map(member => (
      <View key={member.uid} style={styles.exactAmountRow}>
        <Text style={styles.memberName}>{member.name || member.email}:</Text> {/* Use fetched name */}
        <TextInput
          style={styles.exactAmountInput}
          placeholder="0.00"
          value={exactAmounts[member.uid] !== undefined ? String(exactAmounts[member.uid]) : ''}
          onChangeText={(value) => handleExactAmountChange(member.uid, value)}
          keyboardType="numeric"
        />
      </View>
    ));
  };


  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Description:</Text>
      <TextInput style={styles.input} placeholder="e.g., Dinner, Rent" value={description} onChangeText={setDescription}/>

      <Text style={styles.label}>Amount:</Text>
      <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric"/>

      <Text style={styles.label}>Share with Group (Optional):</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={selectedGroupId} onValueChange={(itemValue) => {setSelectedGroupId(itemValue); setSplitMethod('equal'); /* Reset split method on group change */}} style={styles.picker} >
          <Picker.Item label="Personal Expense" value="personal" />
          {userGroups.map(group => (<Picker.Item key={group.id} label={group.name} value={group.id} />))}
        </Picker>
      </View>

      {selectedGroupId && selectedGroupId !== "personal" && (
        <View>
          <Text style={styles.label}>Split Method:</Text>
          <View style={styles.radioContainer}>
            <View style={styles.radioButton}>
              <RadioButton value="equal" status={splitMethod === 'equal' ? 'checked' : 'unchecked'} onPress={() => setSplitMethod('equal')} />
              <Text onPress={() => setSplitMethod('equal')}>Split Equally</Text>
            </View>
            <View style={styles.radioButton}>
              <RadioButton value="exact" status={splitMethod === 'exact' ? 'checked' : 'unchecked'} onPress={() => setSplitMethod('exact')} />
              <Text onPress={() => setSplitMethod('exact')}>By Exact Amounts</Text>
            </View>
          </View>
          {splitMethod === 'exact' && renderExactAmountInputs()}
        </View>
      )}

      <Button title="Add Expense" onPress={handleAddExpense} containerStyle={{marginTop: 20}}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  infoText: {
    textAlign: 'center',
    marginVertical: 10,
    color: 'grey',
    fontSize: 14,
  },
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
  radioContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
  },
  radioButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exactAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  memberName: {
    fontSize: 15,
    flex: 1, // Allow name to take space
  },
  exactAmountInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    width: 100, // Adjust as needed
    textAlign: 'right',
    backgroundColor: '#fff',
  },
});

export default AddExpenseScreen;
