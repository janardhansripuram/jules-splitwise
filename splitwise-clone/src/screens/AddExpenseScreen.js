import React, { useState, useEffect } from 'react'; // Removed useMemo as it wasn't used
import { View, Text, StyleSheet, Alert, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Picker } from '@react-native-picker/picker';
import { RadioButton } from 'react-native-paper';
import { fetchUsernames } from '../utils/userUtils';
import { AntDesign } from '@expo/vector-icons';
import StyledButton from '../components/StyledButton'; // Import StyledButton
import StyledTextInput from '../components/StyledTextInput'; // Import StyledTextInput

const COLORS = { // Define or import your color palette
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#212529',
  textSecondary: '#6c757d',
  primary: '#007bff',
  border: '#ced4da',
  danger: '#dc3545',
  subtleBackground: '#f0f0f0',
};

function AddExpenseScreen({ navigation }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("personal");
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null);
  const [usernamesMap, setUsernamesMap] = useState({}); // Still needed for names if group details has only UIDs

  const [splitMethod, setSplitMethod] = useState('equal');
  const [exactAmounts, setExactAmounts] = useState({});
  const [currentItems, setCurrentItems] = useState([]);
  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false); // For disabling button on submit

  const [isMemberModalVisible, setIsMemberModalVisible] = useState(false);
  const [currentItemIndexForModal, setCurrentItemIndexForModal] = useState(null);
  const [tempSelectedMembers, setTempSelectedMembers] = useState([]);

  // Fetch user's groups for the picker
  useEffect(() => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Auth Error", "Please login.");
      navigation.navigate('Login');
      return;
    }
    // Query for groups where the current user is an accepted member
    const unsubscribe = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: currentUser.uid, status: 'accepted', email: currentUser.email })
      .onSnapshot(querySnapshot => {
        const groupsArray = querySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        setUserGroups(groupsArray);
      }, error => {
        console.error("Error fetching user groups: ", error);
        // Alert.alert("Error", "Could not fetch your groups."); // Can be too noisy
      });
    return () => unsubscribe();
  }, [navigation]);

  // Effect to fetch details (member UIDs and then their names) of the selected group
  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== "personal" && (splitMethod === 'exact' || splitMethod === 'itemized')) {
      setLoadingGroupDetails(true);
      setSelectedGroupDetails(null);
      setExactAmounts({});
      if(splitMethod !== 'itemized') setCurrentItems([]); // Clear items if not in itemized mode and group changes

      const groupRef = firebase.firestore().collection('groups').doc(selectedGroupId);
      groupRef.get().then(async (doc) => {
        if (doc.exists) {
          const groupData = doc.data();
          const acceptedMembersRaw = groupData.members.filter(m => m.status === 'accepted');
          const memberUids = acceptedMembersRaw.map(m => m.uid);

          let currentSelectedGroupData = { ...groupData, id: doc.id, members: [] };

          if (memberUids.length > 0) {
            const namesMap = await fetchUsernames(memberUids);
            setUsernamesMap(prevMap => ({ ...prevMap, ...namesMap }));

            const acceptedMembersWithNames = acceptedMembersRaw.map(m => ({
              ...m, name: namesMap[m.uid] || m.email,
            }));
            currentSelectedGroupData.members = acceptedMembersWithNames;

            if (splitMethod === 'exact') {
              const initialExactAmounts = {};
              acceptedMembersWithNames.forEach(m => initialExactAmounts[m.uid] = '');
              setExactAmounts(initialExactAmounts);
            }
          }
          setSelectedGroupDetails(currentSelectedGroupData);
        } else {
          Alert.alert("Error", "Selected group details not found.");
        }
        setLoadingGroupDetails(false);
      }).catch(error => {
        console.error("Error fetching selected group details: ", error);
        Alert.alert("Error", "Could not fetch selected group details.");
        setLoadingGroupDetails(false);
      });
    } else {
      setSelectedGroupDetails(null);
      setExactAmounts({});
      if (splitMethod !== 'itemized') setCurrentItems([]);
    }
  }, [selectedGroupId, splitMethod]);

  // Calculate total amount from items when in itemized mode
  useEffect(() => {
    if (splitMethod === 'itemized') {
      const total = currentItems.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
      setAmount(total > 0 ? total.toFixed(2) : '');
    }
  }, [currentItems, splitMethod]);

  const handleExactAmountChange = (uid, value) => { /* ... same ... */ setExactAmounts(prev => ({ ...prev, [uid]: value })); };
  const validateExactAmounts = (totalExpenseAmount) => { /* ... same ... */
    let sumOfExactAmounts = 0;
    for (const uid in exactAmounts) {
      const val = parseFloat(exactAmounts[uid] || 0);
      if (isNaN(val) || val < 0) {
        Alert.alert("Validation Error", `Invalid amount for ${usernamesMap[uid] || 'a member'}. Please enter positive numbers.`);
        return false;
      }
      sumOfExactAmounts += val;
    }
    if (Math.abs(sumOfExactAmounts - totalExpenseAmount) > 0.01) {
      Alert.alert("Validation Error", `The sum of individual amounts ($${sumOfExactAmounts.toFixed(2)}) must equal the total expense amount ($${totalExpenseAmount.toFixed(2)}).`);
      return false;
    }
    return true;
  };

  const handleAddExpense = async () => {
    setSubmitting(true);
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) { Alert.alert("Authentication Error", "No user logged in."); setSubmitting(false); return; }
    const currentUserUid = currentUser.uid;

    if (!description.trim()) {
      Alert.alert("Validation Error", "Description is required."); setSubmitting(false); return;
    }
    if (splitMethod !== 'itemized' && (!amount.trim() || parseFloat(amount) <= 0)) {
        Alert.alert("Validation Error", "Amount must be a positive number for this split type."); setSubmitting(false); return;
    }

    const numericAmount = parseFloat(amount);

    let expenseData = {
      description: description.trim(),
      amount: numericAmount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      paidByUid: currentUserUid,
    };

    try {
      if (selectedGroupId && selectedGroupId !== "personal") {
        if (!selectedGroupDetails) {
            Alert.alert("Error", "Group details not fully loaded. Please wait or re-select the group."); setSubmitting(false); return;
        }
        const acceptedMembers = selectedGroupDetails.members;
        if (!acceptedMembers || acceptedMembers.length === 0) {
          Alert.alert("Error", "Selected group has no accepted members to split with."); setSubmitting(false); return;
        }

        if (splitMethod === 'equal') { /* ... same logic ... */
            if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Amount must be a positive number for equal split."); setSubmitting(false); return;}
            expenseData = { ...expenseData, groupId: selectedGroupId, splitType: 'equal', involvedUids: acceptedMembers.map(m => m.uid), amountPerMember: acceptedMembers.length > 0 ? numericAmount / acceptedMembers.length : numericAmount };
        } else if (splitMethod === 'exact') { /* ... same logic ... */
            if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Total amount must be a positive number for exact split."); setSubmitting(false); return;}
            if (!validateExactAmounts(numericAmount)) {setSubmitting(false); return;}
            const memberOwes = {}; const involvedUidsExact = [];
            acceptedMembers.forEach(member => {
              const owesAmount = parseFloat(exactAmounts[member.uid] || 0);
              memberOwes[member.uid] = owesAmount;
              if (owesAmount > 0) involvedUidsExact.push(member.uid);
            });
            if (involvedUidsExact.length === 0 && numericAmount > 0) { Alert.alert("Error", "For exact split, at least one member must owe an amount if total is not zero."); setSubmitting(false); return; }
            expenseData = { ...expenseData, groupId: selectedGroupId, splitType: 'exact', involvedUids: involvedUidsExact, memberOwes: memberOwes };
        } else if (splitMethod === 'itemized') { /* ... same logic, ensure numericAmount is sum of items ... */
            if (currentItems.length === 0) { Alert.alert("Validation Error", "Please add at least one item for itemized split."); setSubmitting(false); return; }
            let formIsValid = true;
            currentItems.forEach(item => {
              if (!item.itemName.trim() || !item.itemAmount.trim() || parseFloat(item.itemAmount) <= 0) formIsValid = false;
              if (!item.assignedTo || item.assignedTo.length === 0) formIsValid = false;
            });
            if (!formIsValid) { Alert.alert("Validation Error", "All items must have a name, a valid positive amount, and at least one member assigned."); setSubmitting(false); return; }

            const memberOwesMap = {}; let calculatedTotalFromItems = 0;
            const finalItems = currentItems.map(item => {
              const itemAmountNum = parseFloat(item.itemAmount); calculatedTotalFromItems += itemAmountNum;
              const numAssigned = item.assignedTo.length;
              if (numAssigned > 0) {
                const sharePerMember = itemAmountNum / numAssigned;
                item.assignedTo.forEach(uid => { memberOwesMap[uid] = (memberOwesMap[uid] || 0) + sharePerMember; });
              }
              return { itemName: item.itemName, itemAmount: itemAmountNum, assignedTo: item.assignedTo };
            });
            if (Math.abs(numericAmount - calculatedTotalFromItems) > 0.01) { Alert.alert("Error", `Total amount ($${numericAmount.toFixed(2)}) does not match sum of items ($${calculatedTotalFromItems.toFixed(2)}).`); setSubmitting(false); return; }
            if (numericAmount <= 0 && currentItems.length > 0) { Alert.alert("Validation Error", "Total amount for itemized expense must be greater than zero."); setSubmitting(false); return; }
            expenseData = { ...expenseData, amount: numericAmount, groupId: selectedGroupId, splitType: 'itemized', items: finalItems, memberOwes: memberOwesMap, involvedUids: Object.keys(memberOwesMap).filter(uid => memberOwesMap[uid] > 0) };
        }
      } else {
        if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Amount must be a positive number for personal expense."); setSubmitting(false); return; }
        expenseData = { ...expenseData, amount: numericAmount, splitType: 'personal', involvedUids: [currentUserUid] };
      }

      await firebase.firestore().collection('expenses').add(expenseData);
      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount.toFixed(2)}`);
      setDescription(''); setAmount(''); setSelectedGroupId("personal"); setSplitMethod('equal');
      setExactAmounts({}); setSelectedGroupDetails(null); setCurrentItems([]);
    } catch (error) {
      console.error("Error adding expense: ", error);
      Alert.alert("Error", "Could not add expense. Details: " + error.message);
    }
    setSubmitting(false);
  };

  // Itemized split UI functions - these are mostly fine, just ensure styles are consistent
  const handleAddItem = () => setCurrentItems([...currentItems, { id: Date.now().toString() + Math.random().toString(36).substr(2, 5), itemName: '', itemAmount: '', assignedTo: [] }]);
  const handleItemChange = (index, field, value) => { /* ... same ... */ const newItems = [...currentItems]; newItems[index][field] = value; setCurrentItems(newItems); };
  const handleRemoveItem = (idToRemove) => setCurrentItems(currentItems.filter(item => item.id !== idToRemove));
  const openMemberAssignmentModal = (index) => { /* ... same ... */ setCurrentItemIndexForModal(index); setTempSelectedMembers(currentItems[index].assignedTo || []); setIsMemberModalVisible(true);};
  const handleMemberSelection = (uid) => { /* ... same ... */ setTempSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);};
  const confirmMemberAssignment = () => { /* ... same ... */ if (currentItemIndexForModal !== null) { handleItemChange(currentItemIndexForModal, 'assignedTo', tempSelectedMembers); } setIsMemberModalVisible(false); setCurrentItemIndexForModal(null); };

  const renderExactAmountInputs = () => {
    if (loadingGroupDetails && splitMethod === 'exact') return <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader}/>;
    if (!selectedGroupDetails || !selectedGroupDetails.members || selectedGroupDetails.members.length === 0 || splitMethod !== 'exact') {
      return splitMethod === 'exact' ? <Text style={styles.infoText}>Select a group with accepted members to split by exact amounts.</Text> : null;
    }
    return selectedGroupDetails.members.map(member => (
      <View key={member.uid} style={styles.exactAmountRow}>
        <Text style={styles.memberNameLabel}>{member.name || member.email}:</Text>
        <StyledTextInput style={styles.exactAmountInput} placeholder="0.00" value={exactAmounts[member.uid] !== undefined ? String(exactAmounts[member.uid]) : ''} onChangeText={(value) => handleExactAmountChange(member.uid, value)} keyboardType="numeric"/>
      </View>));
  };

  const renderItemizedInputs = () => {
    if (loadingGroupDetails && splitMethod === 'itemized') return <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader}/>;
    if (splitMethod !== 'itemized') return null;
    if (!selectedGroupDetails || !selectedGroupDetails.members || selectedGroupDetails.members.length === 0) {
        return <Text style={styles.infoText}>Select a group with accepted members to itemize expenses.</Text>;
    }
    return (
      <View style={styles.itemizedContainer}>
        {currentItems.map((item, index) => (
          <View key={item.id} style={styles.itemRow}>
            <StyledTextInput placeholder="Item Name" value={item.itemName} onChangeText={val => handleItemChange(index, 'itemName', val)} style={[styles.itemInput, styles.itemNameInput]}/>
            <StyledTextInput placeholder="Amount" value={item.itemAmount} onChangeText={val => handleItemChange(index, 'itemAmount', val)} style={[styles.itemInput, styles.itemAmountInput]} keyboardType="numeric"/>
            <TouchableOpacity onPress={() => openMemberAssignmentModal(index)} style={styles.assignButton}><Text style={styles.assignButtonText}>{item.assignedTo.length} assigned</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={styles.removeItemButton}><AntDesign name="minuscircleo" size={24} color={COLORS.danger} /></TouchableOpacity>
          </View>
        ))}
        <StyledButton title="+ Add Item" onPress={handleAddItem} type="secondary" style={{alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal:12, marginTop:5}} textStyle={{fontSize:14}}/>
      </View>
    );
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>Add New Expense</Text>

      <StyledTextInput label="Description" placeholder="e.g., Groceries, Movie Tickets" value={description} onChangeText={setDescription} disabled={submitting}/>

      <StyledTextInput label="Total Amount" placeholder="0.00" value={String(amount)} onChangeText={val => {if (splitMethod !== 'itemized') setAmount(val);}} keyboardType="numeric" editable={splitMethod !== 'itemized' && !submitting} />

      <Text style={styles.label}>Group (Optional)</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={selectedGroupId} onValueChange={val => {setSelectedGroupId(val); setSplitMethod('equal'); setCurrentItems([]);}} style={styles.picker} enabled={!submitting}>
          <Picker.Item label="Personal Expense" value="personal" />
          {userGroups.map(group => (<Picker.Item key={group.id} label={group.name} value={group.id} />))}
        </Picker>
      </View>

      {selectedGroupId && selectedGroupId !== "personal" && (
        <View style={styles.splitSection}>
          <Text style={styles.label}>Split Method</Text>
          <View style={styles.radioContainer}>
            <RadioButton.Group onValueChange={newValue => {setSplitMethod(newValue); if(newValue !== 'itemized') setCurrentItems([]);}} value={splitMethod}>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('equal'); if(splitMethod === 'itemized') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="equal" disabled={submitting}/><Text style={styles.radioLabel}>Equally</Text></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('exact'); if(splitMethod === 'itemized') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="exact" disabled={submitting}/><Text style={styles.radioLabel}>Exact Amounts</Text></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('itemized');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="itemized" disabled={submitting}/><Text style={styles.radioLabel}>Itemized</Text></View></TouchableOpacity>
            </RadioButton.Group>
          </View>
          {splitMethod === 'exact' && renderExactAmountInputs()}
          {splitMethod === 'itemized' && renderItemizedInputs()}
        </View>
      )}

      <StyledButton title={submitting ? "Adding..." : "Add Expense"} onPress={handleAddExpense} type="primary" disabled={submitting} style={{marginTop: 25, width: '100%'}}/>

      {selectedGroupDetails?.members?.length > 0 && (
        <Modal visible={isMemberModalVisible} onRequestClose={() => setIsMemberModalVisible(false)} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Assign Members</Text>
              <ScrollView>
              {selectedGroupDetails.members.map(member => (
                <TouchableOpacity key={member.uid} style={styles.memberSelectItem} onPress={() => handleMemberSelection(member.uid)}>
                  <Text style={styles.memberNameModal}>{member.name || member.email}</Text>
                  <RadioButton value={member.uid} status={tempSelectedMembers.includes(member.uid) ? 'checked' : 'unchecked'} onPress={() => handleMemberSelection(member.uid)}/>
                </TouchableOpacity>
              ))}
              </ScrollView>
              <View style={styles.modalButtonContainer}>
                  <StyledButton title="Cancel" onPress={() => setIsMemberModalVisible(false)} type="secondary" style={{marginRight:10}}/>
                  <StyledButton title="Confirm" onPress={confirmMemberAssignment} type="primary"/>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  scrollContentContainer: { padding: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 25 },
  label: { fontSize: 16, marginBottom: 8, color: COLORS.textSecondary, fontWeight: '500' },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  picker: { height: 50 }, // Ensure this works for both platforms
  splitSection: { marginTop: 10, marginBottom:15, padding:15, backgroundColor: COLORS.cardBackground, borderRadius:8, borderWidth:1, borderColor:COLORS.border},
  radioContainer: { flexDirection: 'column', marginBottom: 10 },
  radioButtonTouchable: { paddingVertical: 8, },
  radioButtonInner: {flexDirection:'row', alignItems:'center'},
  radioLabel: { fontSize: 16, marginLeft: 8, color:COLORS.text },
  infoText: { textAlign: 'center', marginVertical: 10, color: COLORS.textSecondary, fontSize: 14 },
  loader: { marginVertical: 15 },
  exactAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingVertical:5, borderBottomWidth:1, borderBottomColor: COLORS.subtleBorder},
  memberNameLabel: { fontSize: 15, color: COLORS.text, flex: 0.6 }, // Changed from memberName
  exactAmountInput: { flex: 0.4, textAlign: 'right', height:40, paddingVertical:5 }, // Using StyledTextInput, so less styling needed here
  itemizedContainer: { marginVertical: 10, padding: 15, backgroundColor: COLORS.subtleBackground, borderRadius: 8, borderWidth:1, borderColor: COLORS.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
  itemInput: { marginBottom: 0, height:45, paddingVertical:5 }, // Common style for item inputs
  itemNameInput: { flex: 1, marginRight: 8 },
  itemAmountInput: { width: 90, marginRight: 8, textAlign: 'right' },
  assignButton: { paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#e0e0e0', borderRadius: 5, alignItems: 'center', justifyContent:'center', height:45, marginRight: 8},
  assignButtonText: {fontSize: 13, color: COLORS.textSecondary, textAlign:'center'},
  removeItemButton: {padding:5, justifyContent:'center', alignItems:'center', height:45},
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: COLORS.cardBackground, padding: 25, borderRadius: 10, width: '90%', maxHeight: '85%', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: COLORS.text },
  memberSelectItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.subtleBorder },
  memberNameModal: {fontSize: 16, color:COLORS.text},
  modalButtonContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 25 },
});

export default AddExpenseScreen;
