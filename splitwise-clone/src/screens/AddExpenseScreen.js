import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Picker } from '@react-native-picker/picker';
import { RadioButton } from 'react-native-paper';
import { fetchUsernames } from '../utils/userUtils';
import { AntDesign } from '@expo/vector-icons';
import StyledButton from '../components/StyledButton';
import StyledTextInput from '../components/StyledTextInput';

const COLORS = {
  background: '#f8f9fa', cardBackground: '#ffffff', text: '#212529', textSecondary: '#6c757d',
  primary: '#007bff', border: '#ced4da', danger: '#dc3545', subtleBackground: '#f0f0f0',
  success: '#28a745',
};

function AddExpenseScreen({ navigation }) {
  const [currentUserDetails, setCurrentUserDetails] = useState(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  // Group related states
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("personal"); // "personal" or actual groupId
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null); // Full group object if group selected

  // Friend related states for personal expenses
  const [acceptedFriendsList, setAcceptedFriendsList] = useState([]); // [{uid, name}]
  const [selectedFriendsForExpense, setSelectedFriendsForExpense] = useState([]); // [uid1, uid2]
  const [personalExpensePayerUid, setPersonalExpensePayerUid] = useState(null); // UID of who paid for personal shared expense

  // General split/item states
  const [splitMethod, setSplitMethod] = useState('equal'); // 'equal', 'exact', 'itemized'
  const [exactAmounts, setExactAmounts] = useState({}); // { uid: amount }
  const [currentItems, setCurrentItems] = useState([]);

  const [usernamesMap, setUsernamesMap] = useState({}); // General UID -> Name map
  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [isMemberModalVisible, setIsMemberModalVisible] = useState(false); // For item member assignment
  const [currentItemIndexForModal, setCurrentItemIndexForModal] = useState(null);
  const [tempSelectedMembers, setTempSelectedMembers] = useState([]);

  const [isFriendSelectorModalVisible, setIsFriendSelectorModalVisible] = useState(false); // For selecting friends for personal expense


  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (!user) {
      Alert.alert("Auth Error", "Please login.");
      navigation.navigate('Login');
      return;
    }
    setCurrentUserDetails({ uid: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0] });
    setPersonalExpensePayerUid(user.uid); // Default payer for personal expense is current user

    // Fetch user's groups
    const unsubGroups = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: user.uid, status: 'accepted', email: user.email })
      .onSnapshot(snap => setUserGroups(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }))),
                  err => console.error("Error fetching groups:", err));

    return () => unsubGroups();
  }, [navigation]);

  // Fetch accepted friends when "Personal" expense is selected
  useEffect(() => {
    if (selectedGroupId === "personal" && currentUserDetails) {
      setLoadingFriends(true);
      const fsQuery = firebase.firestore().collection('friendships')
        .where('userUids', 'array-contains', currentUserDetails.uid)
        .where('status', '==', 'accepted');

      fsQuery.get().then(async snapshot => {
        const friends = [];
        const friendUids = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const friendUid = data.userUids.find(uid => uid !== currentUserDetails.uid);
          if (friendUid) friendUids.push(friendUid);
        });
        if (friendUids.length > 0) {
          const names = await fetchUsernames(friendUids);
          friendUids.forEach(uid => friends.push({ uid, name: names[uid] || 'Friend' }));
        }
        setAcceptedFriendsList(friends);
        setLoadingFriends(false);
      }).catch(err => {
        console.error("Error fetching friends:", err);
        setLoadingFriends(false);
      });
    } else {
      setAcceptedFriendsList([]); // Clear if group selected
      setSelectedFriendsForExpense([]); // Clear selected friends
    }
  }, [selectedGroupId, currentUserDetails]);


  // Fetch details for selected group (for exact/itemized splits)
  useEffect(() => {
    // This logic mostly remains, ensure it uses selectedGroupDetails.members for UI
    if (selectedGroupId && selectedGroupId !== "personal" && (splitMethod === 'exact' || splitMethod === 'itemized')) {
      setLoadingGroupDetails(true);
      // ... (existing group detail fetching logic - ensure it populates selectedGroupDetails.members with {uid, name})
      // ... (ensure usernamesMap is updated if needed from here too)
       const groupRef = firebase.firestore().collection('groups').doc(selectedGroupId);
       groupRef.get().then(async (doc) => {
         if (doc.exists) {
           const groupData = doc.data();
           const acceptedMembersRaw = groupData.members.filter(m => m.status === 'accepted');
           const memberUids = acceptedMembersRaw.map(m => m.uid);
           let currentSelectedGroupData = { ...groupData, id: doc.id, members: [] };
           if (memberUids.length > 0) {
             const namesMap = await fetchUsernames(memberUids);
             setUsernamesMap(prev => ({ ...prev, ...namesMap }));
             currentSelectedGroupData.members = acceptedMembersRaw.map(m => ({ ...m, name: namesMap[m.uid] || m.email }));
           }
           setSelectedGroupDetails(currentSelectedGroupData);
           if (splitMethod === 'exact') {
             const initialExactAmounts = {};
             currentSelectedGroupData.members.forEach(m => initialExactAmounts[m.uid] = '');
             setExactAmounts(initialExactAmounts);
           }
         } setLoadingGroupDetails(false);
       }).catch(err => { console.error(err); setLoadingGroupDetails(false);});
    } else {
      setSelectedGroupDetails(null); setExactAmounts({});
    }
  }, [selectedGroupId, splitMethod]);

  // Auto-calculate total amount from items
  useEffect(() => { /* ... same ... */
    if (splitMethod === 'itemized') {
      const total = currentItems.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
      setAmount(total > 0 ? total.toFixed(2) : '');
    }
  }, [currentItems, splitMethod]);

  const handleExactAmountChange = (uid, value, isPersonal) => {
    const targetState = isPersonal ? setExactAmountsForPersonal : setExactAmounts; // Assuming you'll have separate state for personal exact amounts
    targetState(prev => ({ ...prev, [uid]: value }));
  };
  // Need a separate exactAmounts state for personal shared expenses if structure differs
  const [exactAmountsForPersonal, setExactAmountsForPersonal] = useState({});


  const validateExactAmounts = (totalExpenseAmount, amountsObject, involvedUsersForValidation) => {
    let sumOfExactAmounts = 0;
    let allAmountsValid = true;
    involvedUsersForValidation.forEach(user => {
        const valStr = amountsObject[user.uid] || '0';
        const val = parseFloat(valStr);
        if (isNaN(val) || val < 0) {
            Alert.alert("Validation Error", `Invalid amount for ${usernamesMap[user.uid] || user.name || 'a participant'}. Please enter positive numbers.`);
            allAmountsValid = false;
        }
        sumOfExactAmounts += val;
    });
    if (!allAmountsValid) return false;

    if (Math.abs(sumOfExactAmounts - totalExpenseAmount) > 0.01) {
      Alert.alert("Validation Error", `The sum of individual amounts ($${sumOfExactAmounts.toFixed(2)}) must equal the total expense amount ($${totalExpenseAmount.toFixed(2)}).`);
      return false;
    }
    return true;
  };

  const handleAddExpense = async () => { /* ... (Main submit logic) ... */
    setSubmitting(true);
    if (!currentUserDetails) { Alert.alert("Auth Error", "User details not found."); setSubmitting(false); return; }
    const { uid: currentUserUid, email: currentUserEmail, name: currentUserName } = currentUserDetails;

    if (!description.trim()) { Alert.alert("Validation Error", "Description is required."); setSubmitting(false); return; }

    const isItemGroupSplit = selectedGroupId !== "personal" && splitMethod === 'itemized';
    const isPersonalSharedSplit = selectedGroupId === "personal" && selectedFriendsForExpense.length > 0;

    if (!isItemGroupSplit && (!amount.trim() || parseFloat(amount) <= 0)) {
        Alert.alert("Validation Error", "Amount must be a positive number."); setSubmitting(false); return;
    }
    const numericAmount = parseFloat(amount);

    let expenseData = {
      description: description.trim(),
      amount: numericAmount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      // paidByUid will be set based on context (group or personal shared)
    };

    try {
      if (selectedGroupId && selectedGroupId !== "personal") { // GROUP EXPENSE
        expenseData.groupId = selectedGroupId;
        expenseData.paidByUid = currentUserUid; // For group expenses, current user is assumed payer for now

        if (!selectedGroupDetails) { Alert.alert("Error", "Group details not loaded."); setSubmitting(false); return; }
        const acceptedGroupMembers = selectedGroupDetails.members;
        if (!acceptedGroupMembers || acceptedGroupMembers.length === 0) { Alert.alert("Error", "No accepted members in group."); setSubmitting(false); return; }

        if (splitMethod === 'equal') { /* ... */
            expenseData = { ...expenseData, splitType: 'equal', involvedUids: acceptedGroupMembers.map(m => m.uid), amountPerMember: numericAmount / acceptedGroupMembers.length };
        } else if (splitMethod === 'exact') { /* ... */
            if (!validateExactAmounts(numericAmount, exactAmounts, acceptedGroupMembers)) { setSubmitting(false); return; }
            const memberOwes = {}; acceptedGroupMembers.forEach(m => memberOwes[m.uid] = parseFloat(exactAmounts[m.uid] || 0));
            expenseData = { ...expenseData, splitType: 'exact', involvedUids: acceptedGroupMembers.filter(m => memberOwes[m.uid] > 0).map(m=>m.uid), memberOwes };
        } else if (splitMethod === 'itemized') { /* ... (existing itemized logic for groups) ... */
            if (currentItems.length === 0) { Alert.alert("Validation Error", "Please add at least one item."); setSubmitting(false); return; }
            // ... (validation for items as before)
            const memberOwesMap = {}; let calculatedTotalFromItems = 0;
            const finalItems = currentItems.map(item => { /* ... as before ... */
                const itemAmountNum = parseFloat(item.itemAmount); calculatedTotalFromItems += itemAmountNum;
                const numAssigned = item.assignedTo.length;
                if (numAssigned > 0) { const sharePerMember = itemAmountNum / numAssigned; item.assignedTo.forEach(uid => { memberOwesMap[uid] = (memberOwesMap[uid] || 0) + sharePerMember; });}
                return { itemName: item.itemName, itemAmount: itemAmountNum, assignedTo: item.assignedTo };
            });
            if (Math.abs(numericAmount - calculatedTotalFromItems) > 0.01) { Alert.alert("Error", "Total amount mismatch."); setSubmitting(false); return; }
            expenseData = { ...expenseData, amount: numericAmount, splitType: 'itemized', items: finalItems, memberOwes: memberOwesMap, involvedUids: Object.keys(memberOwesMap).filter(uid => memberOwesMap[uid] > 0) };
        }
      } else if (selectedFriendsForExpense.length > 0) { // PERSONAL EXPENSE SHARED WITH FRIENDS
        expenseData.groupId = null; // Explicitly null for personal
        expenseData.paidByUid = personalExpensePayerUid;

        const involvedUsersForPersonalSplit = [{uid: personalExpensePayerUid, name: usernamesMap[personalExpensePayerUid] || currentUserName}];
        selectedFriendsForExpense.forEach(friendUid => {
            if (friendUid !== personalExpensePayerUid) { // Avoid duplicating payer if also in selected friends
                involvedUsersForPersonalSplit.push({uid: friendUid, name: usernamesMap[friendUid] || 'Friend'});
            }
        });
        const involvedUids = involvedUsersForPersonalSplit.map(u=>u.uid);


        if (splitMethod === 'equal') {
          if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Amount must be positive for equal split."); setSubmitting(false); return;}
          expenseData = { ...expenseData, splitType: 'equal', involvedUids: involvedUids, amountPerMember: numericAmount / involvedUids.length };
        } else if (splitMethod === 'exact') {
          if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Total amount must be positive for exact split."); setSubmitting(false); return;}
          // Use exactAmountsForPersonal for validation and data
          if (!validateExactAmounts(numericAmount, exactAmountsForPersonal, involvedUsersForPersonalSplit)) { setSubmitting(false); return; }
          const memberOwes = {}; involvedUsersForPersonalSplit.forEach(u => memberOwes[u.uid] = parseFloat(exactAmountsForPersonal[u.uid] || 0));
          expenseData = { ...expenseData, splitType: 'exact', involvedUids: involvedUsersForPersonalSplit.filter(u=>memberOwes[u.uid] > 0).map(u=>u.uid), memberOwes };
        } else {
             Alert.alert("Error", "Itemized split is not supported for personal shared expenses in this version."); setSubmitting(false); return;
        }
      } else { // PURELY PERSONAL EXPENSE (SOLO)
        if (isNaN(numericAmount) || numericAmount <= 0) { Alert.alert("Validation Error", "Amount must be positive."); setSubmitting(false); return; }
        expenseData = { ...expenseData, groupId: null, paidByUid: currentUserUid, splitType: 'personal_solo', involvedUids: [currentUserUid] };
      }

      await firebase.firestore().collection('expenses').add(expenseData);
      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount.toFixed(2)}`);
      // Reset form
      setDescription(''); setAmount(''); setSelectedGroupId("personal"); setSplitMethod('equal');
      setExactAmounts({}); setSelectedGroupDetails(null); setCurrentItems([]);
      setAcceptedFriendsList([]); setSelectedFriendsForExpense([]); setPersonalExpensePayerUid(currentUserUid); setExactAmountsForPersonal({});
    } catch (error) {
      console.error("Error adding expense: ", error);
      Alert.alert("Error", "Could not add expense. Details: " + error.message);
    }
    setSubmitting(false);
  };

  // Itemized split UI functions
  const handleAddItem = () => setCurrentItems([...currentItems, { id: Date.now().toString() + Math.random().toString(36).substr(2, 5), itemName: '', itemAmount: '', assignedTo: [] }]);
  const handleItemChange = (index, field, value) => { const newItems = [...currentItems]; newItems[index][field] = value; setCurrentItems(newItems); };
  const handleRemoveItem = (idToRemove) => setCurrentItems(currentItems.filter(item => item.id !== idToRemove));
  const openMemberAssignmentModal = (index) => { setCurrentItemIndexForModal(index); setTempSelectedMembers(currentItems[index].assignedTo || []); setIsMemberModalVisible(true);};
  const handleMemberSelectionForItem = (uid) => setTempSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  const confirmMemberAssignment = () => { if (currentItemIndexForModal !== null) { handleItemChange(currentItemIndexForModal, 'assignedTo', tempSelectedMembers); } setIsMemberModalVisible(false); setCurrentItemIndexForModal(null); };

  // Friend selection for personal expense
  const toggleFriendSelectionForExpense = (friendUid) => {
    setSelectedFriendsForExpense(prev =>
      prev.includes(friendUid) ? prev.filter(uid => uid !== friendUid) : [...prev, friendUid]
    );
  };

  const renderExactAmountInputs = (forPersonalExpense = false) => {
    const isLoading = loadingGroupDetails || (forPersonalExpense && loadingFriends);
    const membersToList = forPersonalExpense
        ? [{uid: personalExpensePayerUid, name: usernamesMap[personalExpensePayerUid] || currentUserDetails?.name}, ...selectedFriendsForExpense.filter(uid => uid !== personalExpensePayerUid).map(uid => ({uid, name: usernamesMap[uid] || 'Friend'}))]
        : selectedGroupDetails?.members;
    const amountsState = forPersonalExpense ? exactAmountsForPersonal : exactAmounts;
    const handler = forPersonalExpense ? (uid,val) => handleExactAmountChange(uid,val,true) : (uid,val) => handleExactAmountChange(uid,val,false);

    if (isLoading && splitMethod === 'exact') return <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader}/>;
    if (!membersToList || membersToList.length === 0 || splitMethod !== 'exact') {
      return splitMethod === 'exact' ? <Text style={styles.infoText}>Select participants to split by exact amounts.</Text> : null;
    }
    return membersToList.map(member => (
      <View key={member.uid} style={styles.exactAmountRow}>
        <Text style={styles.memberNameLabel}>{member.name || member.email}:</Text>
        <StyledTextInput style={styles.exactAmountInput} placeholder="0.00" value={amountsState[member.uid] !== undefined ? String(amountsState[member.uid]) : ''} onChangeText={(value) => handler(member.uid, value)} keyboardType="numeric"/>
      </View>));
  };

  const renderItemizedInputs = () => { /* ... (Keep existing, but ensure it uses selectedGroupDetails.members) ... */
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

  const renderPersonalShareSection = () => {
    if (selectedGroupId !== "personal" || acceptedFriendsList.length === 0) return null;

    const involvedInPersonalSplit = [
        { uid: currentUserDetails.uid, name: `You (${currentUserDetails.name})` },
        ...acceptedFriendsList.filter(f => selectedFriendsForExpense.includes(f.uid))
    ];
    if (personalExpensePayerUid !== currentUserDetails.uid && !selectedFriendsForExpense.includes(personalExpensePayerUid)) {
        // If payer is a friend not in selectedFriendsForExpense, add them to involved list for exact amounts.
        const payerFriend = acceptedFriendsList.find(f => f.uid === personalExpensePayerUid);
        if (payerFriend) involvedInPersonalSplit.push(payerFriend);
    }
    // Ensure unique list for exact amounts if payer was also in selectedFriendsForExpense
    const uniqueInvolvedForExact = Array.from(new Set(involvedInPersonalSplit.map(u => u.uid))).map(uid => involvedInPersonalSplit.find(u => u.uid === uid));


    return (
      <View style={styles.splitSection}>
        <Text style={styles.label}>Share with Friends (Optional)</Text>
        <StyledButton title={isFriendSelectorModalVisible ? "Close Friend Selector" : "Select Friends to Share With"} onPress={()=>setIsFriendSelectorModalVisible(!isFriendSelectorModalVisible)} type="outline" style={{marginBottom:10}}/>
        {selectedFriendsForExpense.length > 0 && (
          <View>
            <Text style={styles.label}>Payer for this personal expense:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={personalExpensePayerUid} onValueChange={val => setPersonalExpensePayerUid(val)} style={styles.picker} enabled={!submitting}>
                <Picker.Item label={`You (${currentUserDetails?.name})`} value={currentUserDetails?.uid} />
                {selectedFriendsForExpense.map(friendUid => {
                  const friend = acceptedFriendsList.find(f => f.uid === friendUid);
                  return <Picker.Item key={friendUid} label={friend?.name || 'Friend'} value={friendUid} />;
                })}
              </Picker>
            </View>
            <Text style={styles.label}>Split Method for Personal Share:</Text>
            <View style={styles.radioContainer}>
              <RadioButton.Group onValueChange={newValue => setSplitMethod(newValue)} value={splitMethod}>
                <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('equal');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="equal" disabled={submitting}/><Text style={styles.radioLabel}>Equally</Text></View></TouchableOpacity>
                <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('exact');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="exact" disabled={submitting}/><Text style={styles.radioLabel}>Exact Amounts</Text></View></TouchableOpacity>
              </RadioButton.Group>
            </View>
            {splitMethod === 'exact' && renderExactAmountInputs(true)}
          </View>
        )}
      </View>
    );
  };


  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>Add New Expense</Text>
      <StyledTextInput label="Description" placeholder="e.g., Dinner, Rent" value={description} onChangeText={setDescription} disabled={submitting}/>
      <StyledTextInput label="Total Amount" placeholder="0.00" value={String(amount)} onChangeText={val => {if (splitMethod !== 'itemized' || selectedGroupId === 'personal') setAmount(val);}} keyboardType="numeric" editable={(splitMethod !== 'itemized' || selectedGroupId === 'personal') && !submitting} />

      <Text style={styles.label}>Expense Type</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={selectedGroupId}
          onValueChange={val => {
            setSelectedGroupId(val);
            setSplitMethod('equal'); // Reset split method
            setCurrentItems([]); // Reset items
            setSelectedFriendsForExpense([]); // Reset selected friends
            if(currentUserDetails) setPersonalExpensePayerUid(currentUserDetails.uid); // Reset payer for personal
            setExactAmounts({}); // Reset group exact amounts
            setExactAmountsForPersonal({}); // Reset personal exact amounts
          }}
          style={styles.picker} enabled={!submitting}
        >
          <Picker.Item label="Personal Expense" value="personal" />
          {userGroups.map(group => (<Picker.Item key={group.id} label={group.name} value={group.id} />))}
        </Picker>
      </View>

      {selectedGroupId && selectedGroupId !== "personal" && ( // Group Expense Options
        <View style={styles.splitSection}>
          <Text style={styles.label}>Split Method (Group)</Text>
          <View style={styles.radioContainer}>
            <RadioButton.Group onValueChange={newValue => {setSplitMethod(newValue); if(newValue !== 'itemized') setCurrentItems([]);}} value={splitMethod}>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('equal'); if(splitMethod === 'itemized') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="equal" disabled={submitting}/><Text style={styles.radioLabel}>Equally</Text></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('exact'); if(splitMethod === 'itemized') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="exact" disabled={submitting}/><Text style={styles.radioLabel}>Exact Amounts</Text></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('itemized');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="itemized" disabled={submitting}/><Text style={styles.radioLabel}>Itemized</Text></View></TouchableOpacity>
            </RadioButton.Group>
          </View>
          {splitMethod === 'exact' && renderExactAmountInputs(false)}
          {splitMethod === 'itemized' && renderItemizedInputs()}
        </View>
      )}

      {selectedGroupId === "personal" && renderPersonalShareSection()}

      <StyledButton title={submitting ? "Adding..." : "Add Expense"} onPress={handleAddExpense} type="primary" disabled={submitting} style={{marginTop: 25, width: '100%'}}/>

      {/* Item Member Assignment Modal (for group itemized expenses) */}
      {selectedGroupDetails?.members?.length > 0 && splitMethod==='itemized' && selectedGroupId !== 'personal' && (
        <Modal visible={isMemberModalVisible} onRequestClose={() => setIsMemberModalVisible(false)} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Members to Item</Text>
            <ScrollView>
            {selectedGroupDetails.members.map(member => (
              <TouchableOpacity key={member.uid} style={styles.memberSelectItem} onPress={() => handleMemberSelectionForItem(member.uid)}>
                <Text style={styles.memberNameModal}>{member.name || member.email}</Text>
                <RadioButton value={member.uid} status={tempSelectedMembers.includes(member.uid) ? 'checked' : 'unchecked'} onPress={() => handleMemberSelectionForItem(member.uid)}/>
              </TouchableOpacity>))}
            </ScrollView>
            <View style={styles.modalButtonContainer}><StyledButton title="Cancel" onPress={() => setIsMemberModalVisible(false)} type="secondary" style={{marginRight:10}}/><StyledButton title="Confirm" onPress={confirmMemberAssignment} type="primary"/></View>
          </View></View>
        </Modal>
      )}

      {/* Friend Selector Modal (for personal shared expenses) */}
      <Modal visible={isFriendSelectorModalVisible} onRequestClose={() => setIsFriendSelectorModalVisible(false)} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Share with Friends</Text>
          {loadingFriends ? <ActivityIndicator color={COLORS.primary}/> : acceptedFriendsList.length === 0 ? <Text style={styles.infoText}>No friends found. Add friends in the 'Friends' screen.</Text> :
            <ScrollView>
            {acceptedFriendsList.map(friend => (
              <TouchableOpacity key={friend.uid} style={styles.memberSelectItem} onPress={() => toggleFriendSelectionForExpense(friend.uid)}>
                <Text style={styles.memberNameModal}>{friend.name}</Text>
                <RadioButton value={friend.uid} status={selectedFriendsForExpense.includes(friend.uid) ? 'checked' : 'unchecked'} />
              </TouchableOpacity>))}
            </ScrollView>
          }
          <View style={styles.modalButtonContainer}><StyledButton title="Done" onPress={() => setIsFriendSelectorModalVisible(false)} type="primary"/></View>
        </View></View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  scrollContentContainer: { padding: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 25 },
  label: { fontSize: 16, marginBottom: 8, color: COLORS.textSecondary, fontWeight: '500' },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  picker: { height: 50 },
  splitSection: { marginTop: 10, marginBottom:15, padding:15, backgroundColor: COLORS.cardBackground, borderRadius:8, borderWidth:1, borderColor:COLORS.border},
  radioContainer: { flexDirection: 'column', marginBottom: 10 },
  radioButtonTouchable: { paddingVertical: 8 },
  radioButtonInner: {flexDirection:'row', alignItems:'center'},
  radioLabel: { fontSize: 16, marginLeft: 8, color:COLORS.text },
  infoText: { textAlign: 'center', marginVertical: 10, color: COLORS.textSecondary, fontSize: 14 },
  loader: { marginVertical: 15 },
  exactAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingVertical:5, borderBottomWidth:1, borderBottomColor: COLORS.subtleBorder},
  memberNameLabel: { fontSize: 15, color: COLORS.text, flex: 0.6 },
  exactAmountInput: { flex: 0.4, textAlign: 'right', height:40, paddingVertical:5 },
  itemizedContainer: { marginVertical: 10, padding: 15, backgroundColor: COLORS.subtleBackground, borderRadius: 8, borderWidth:1, borderColor: COLORS.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
  itemInput: { marginBottom: 0, height:45, paddingVertical:5 },
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
