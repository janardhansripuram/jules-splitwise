import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Picker } from '@react-native-picker/picker';
import { RadioButton, Text as PaperText, useTheme, ActivityIndicator as PaperActivityIndicator, Button as PaperButton, TextInput as PaperTextInput, Portal, Dialog } from 'react-native-paper';
import { fetchUsernames } from '../utils/userUtils';
import { AntDesign } from '@expo/vector-icons';

// COLORS constant is removed, will use theme.colors

function AddExpenseScreen({ navigation }) {
  const theme = useTheme(); // Use theme
  const [currentUserDetails, setCurrentUserDetails] = useState(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("personal");
  const [selectedGroupDetails, setSelectedGroupDetails] = useState(null);

  const [acceptedFriendsList, setAcceptedFriendsList] = useState([]);
  const [selectedFriendsForExpense, setSelectedFriendsForExpense] = useState([]);
  const [personalExpensePayerUid, setPersonalExpensePayerUid] = useState(null);

  const [splitMethod, setSplitMethod] = useState('equal');
  const [exactAmounts, setExactAmounts] = useState({});
  const [currentItems, setCurrentItems] = useState([]);
  const [usernamesMap, setUsernamesMap] = useState({});

  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [isMemberModalVisible, setIsMemberModalVisible] = useState(false);
  const [currentItemIndexForModal, setCurrentItemIndexForModal] = useState(null);
  const [tempSelectedMembers, setTempSelectedMembers] = useState([]);

  const [isFriendSelectorModalVisible, setIsFriendSelectorModalVisible] = useState(false);
  const [exactAmountsForPersonal, setExactAmountsForPersonal] = useState({});


  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (!user) {
      Alert.alert("Auth Error", "Please login.");
      navigation.navigate('Login');
      return;
    }
    // Fetch user's name from 'users' collection if displayName is not available
    const userDocRef = firebase.firestore().collection('users').doc(user.uid);
    userDocRef.get().then(doc => {
        if (doc.exists) {
            setCurrentUserDetails({ uid: user.uid, email: user.email, name: doc.data().name || user.email.split('@')[0] });
        } else {
            setCurrentUserDetails({ uid: user.uid, email: user.email, name: user.email.split('@')[0] });
        }
        setPersonalExpensePayerUid(user.uid);
    });

    const unsubGroups = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: user.uid, status: 'accepted', email: user.email })
      .onSnapshot(snap => setUserGroups(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }))),
                  err => console.error("Error fetching groups:", err));

    return () => unsubGroups();
  }, [navigation]);

  // Fetch accepted friends
  useEffect(() => {
    if (selectedGroupId === "personal" && currentUserDetails) {
      setLoadingFriends(true);
      const fsQuery = firebase.firestore().collection('friendships')
        .where('userUids', 'array-contains', currentUserDetails.uid)
        .where('status', '==', 'accepted');

      fsQuery.get().then(async snapshot => {
        const friends = []; const friendUids = [];
        snapshot.forEach(doc => {
          const data = doc.data(); const friendUid = data.userUids.find(uid => uid !== currentUserDetails.uid);
          if (friendUid) friendUids.push(friendUid);
        });
        if (friendUids.length > 0) {
          const names = await fetchUsernames(friendUids);
          friendUids.forEach(uid => friends.push({ uid, name: names[uid] || 'Friend' }));
          setUsernamesMap(prev => ({...prev, ...names})); // Update global usernamesMap
        }
        setAcceptedFriendsList(friends);
        setLoadingFriends(false);
      }).catch(err => { console.error("Error fetching friends:", err); setLoadingFriends(false); });
    } else {
      setAcceptedFriendsList([]); setSelectedFriendsForExpense([]);
    }
  }, [selectedGroupId, currentUserDetails]);

  // Fetch group details (for exact/itemized when group is selected)
  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== "personal" && (splitMethod === 'exact' || splitMethod === 'itemized')) {
      setLoadingGroupDetails(true);
      setSelectedGroupDetails(null); setExactAmounts({});
      if(splitMethod !== 'itemized') setCurrentItems([]);

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
      // Don't clear currentItems if splitMethod is itemized (it means selectedGroupId became "personal")
      if (splitMethod !== 'itemized' && selectedGroupId === 'personal') setCurrentItems([]);
    }
  }, [selectedGroupId, splitMethod]);

  // Auto-calculate total amount from items (Only for group itemized)
  useEffect(() => {
    if (splitMethod === 'itemized' && selectedGroupId !== 'personal') {
      const total = currentItems.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
      setAmount(total > 0 ? total.toFixed(2) : '');
    }
  }, [currentItems, splitMethod, selectedGroupId]);

  const handleExactAmountChange = (uid, value, isPersonal) => {
    const targetStateSetter = isPersonal ? setExactAmountsForPersonal : setExactAmounts;
    targetStateSetter(prev => ({ ...prev, [uid]: value }));
  };

  const validateExactAmounts = (totalExpenseAmount, amountsObject, involvedUsersForValidation) => {
    let sumOfExactAmounts = 0; let allAmountsValid = true;
    involvedUsersForValidation.forEach(user => {
        const valStr = amountsObject[user.uid] || '0'; const val = parseFloat(valStr);
        if (isNaN(val) || val < 0) { allAmountsValid = false; } sumOfExactAmounts += val;
    });
    if (!allAmountsValid) { Alert.alert("Validation Error", `Invalid amount for one or more participants. Please enter positive numbers.`); return false; }
    if (Math.abs(sumOfExactAmounts - totalExpenseAmount) > 0.01) {
      Alert.alert("Validation Error", `Sum of amounts ($${sumOfExactAmounts.toFixed(2)}) must equal total ($${totalExpenseAmount.toFixed(2)}).`); return false;
    } return true;
  };

  const handleAddExpense = async () => {
    setSubmitting(true);
    if (!currentUserDetails) { Alert.alert("Auth Error", "User details not found."); setSubmitting(false); return; }
    const { uid: currentUserUid, name: currentUserName } = currentUserDetails;

    if (!description.trim()) { Alert.alert("Validation Error", "Description is required."); setSubmitting(false); return; }

    const isItemGroupItemized = selectedGroupId !== "personal" && splitMethod === 'itemized';
    if (!isItemGroupItemized && (!amount.trim() || parseFloat(amount) <= 0)) {
        Alert.alert("Validation Error", "Amount must be a positive number."); setSubmitting(false); return;
    }
    const numericAmount = parseFloat(amount);

    let expenseData = {
      description: description.trim(), amount: numericAmount,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      if (selectedGroupId && selectedGroupId !== "personal") {
        expenseData.groupId = selectedGroupId;
        expenseData.paidByUid = currentUserUid;

        if (!selectedGroupDetails) { Alert.alert("Error", "Group details not loaded."); setSubmitting(false); return; }
        const acceptedMembers = selectedGroupDetails.members;
        if (!acceptedMembers || acceptedMembers.length === 0) { Alert.alert("Error", "No accepted members in group."); setSubmitting(false); return; }

        if (splitMethod === 'equal') {
            expenseData = { ...expenseData, splitType: 'equal', involvedUids: acceptedMembers.map(m => m.uid), amountPerMember: numericAmount / acceptedMembers.length };
        } else if (splitMethod === 'exact') {
            if (!validateExactAmounts(numericAmount, exactAmounts, acceptedMembers)) { setSubmitting(false); return; }
            const memberOwes = {}; acceptedMembers.forEach(m => memberOwes[m.uid] = parseFloat(exactAmounts[m.uid] || 0));
            expenseData = { ...expenseData, splitType: 'exact', involvedUids: acceptedMembers.filter(m => memberOwes[m.uid] > 0).map(m=>m.uid), memberOwes };
        } else if (splitMethod === 'itemized') {
            if (currentItems.length === 0) { Alert.alert("Validation Error", "Add items for itemized split."); setSubmitting(false); return; }
            let formIsValid = true;
            currentItems.forEach(item => {
              if (!item.itemName.trim() || !item.itemAmount.trim() || parseFloat(item.itemAmount) <= 0 || !item.assignedTo || item.assignedTo.length === 0) formIsValid = false;
            });
            if (!formIsValid) { Alert.alert("Validation Error", "All items must have name, positive amount, and assigned members."); setSubmitting(false); return; }

            const memberOwesMap = {}; let calculatedTotalFromItems = 0;
            const finalItems = currentItems.map(item => {
                const itemAmountNum = parseFloat(item.itemAmount); calculatedTotalFromItems += itemAmountNum;
                const numAssigned = item.assignedTo.length;
                if (numAssigned > 0) { const sharePerMember = itemAmountNum / numAssigned; item.assignedTo.forEach(uid => { memberOwesMap[uid] = (memberOwesMap[uid] || 0) + sharePerMember; });}
                return { itemName: item.itemName, itemAmount: itemAmountNum, assignedTo: item.assignedTo };
            });
            if (Math.abs(numericAmount - calculatedTotalFromItems) > 0.01) { Alert.alert("Error", "Total amount mismatch with items sum."); setSubmitting(false); return; }
            expenseData = { ...expenseData, amount: numericAmount, splitType: 'itemized', items: finalItems, memberOwes: memberOwesMap, involvedUids: Object.keys(memberOwesMap).filter(uid => memberOwesMap[uid] > 0) };
        }
      } else if (selectedFriendsForExpense.length > 0) {
        expenseData.groupId = null;
        expenseData.paidByUid = personalExpensePayerUid;

        const involvedUsersForPersonalSplit = [{uid: personalExpensePayerUid, name: usernamesMap[personalExpensePayerUid] || (personalExpensePayerUid === currentUserUid ? currentUserName : 'Payer')}];
        selectedFriendsForExpense.forEach(friendUid => {
            if (friendUid !== personalExpensePayerUid) {
                involvedUsersForPersonalSplit.push({uid: friendUid, name: usernamesMap[friendUid] || acceptedFriendsList.find(f=>f.uid===friendUid)?.name || 'Friend'});
            }
        });
        const involvedUids = involvedUsersForPersonalSplit.map(u=>u.uid);

        if (splitMethod === 'equal') {
          expenseData = { ...expenseData, splitType: 'equal', involvedUids: involvedUids, amountPerMember: numericAmount / involvedUids.length };
        } else if (splitMethod === 'exact') {
          if (!validateExactAmounts(numericAmount, exactAmountsForPersonal, involvedUsersForPersonalSplit)) { setSubmitting(false); return; }
          const memberOwes = {}; involvedUsersForPersonalSplit.forEach(u => memberOwes[u.uid] = parseFloat(exactAmountsForPersonal[u.uid] || 0));
          expenseData = { ...expenseData, splitType: 'exact', involvedUids: involvedUsersForPersonalSplit.filter(u=>memberOwes[u.uid] > 0).map(u=>u.uid), memberOwes };
        } else {
             Alert.alert("Not Supported", "Itemized split is currently only for group expenses."); setSubmitting(false); return;
        }
      } else {
        expenseData = { ...expenseData, groupId: null, paidByUid: currentUserUid, splitType: 'personal_solo', involvedUids: [currentUserUid] };
      }

      await firebase.firestore().collection('expenses').add(expenseData);
      Alert.alert("Expense Added", `Description: ${description}, Amount: ${numericAmount.toFixed(2)}`);
      setDescription(''); setAmount(''); setSelectedGroupId("personal"); setSplitMethod('equal');
      setExactAmounts({}); setSelectedGroupDetails(null); setCurrentItems([]);
      setSelectedFriendsForExpense([]);
      if(currentUserDetails) setPersonalExpensePayerUid(currentUserDetails.uid);
      setExactAmountsForPersonal({});
    } catch (error) { console.error(error); Alert.alert("Error", "Could not add expense: " + error.message); }
    setSubmitting(false);
  };

  const handleAddItem = () => setCurrentItems([...currentItems, { id: Date.now().toString() + Math.random().toString(36).substr(2, 5), itemName: '', itemAmount: '', assignedTo: [] }]);
  const handleItemChange = (index, field, value) => { const newItems = [...currentItems]; newItems[index][field] = value; setCurrentItems(newItems); };
  const handleRemoveItem = (idToRemove) => setCurrentItems(currentItems.filter(item => item.id !== idToRemove));
  const openMemberAssignmentModal = (index) => { setCurrentItemIndexForModal(index); setTempSelectedMembers(currentItems[index].assignedTo || []); setIsMemberModalVisible(true);};
  const handleMemberSelectionForItem = (uid) => setTempSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  const confirmMemberAssignment = () => { if (currentItemIndexForModal !== null) { handleItemChange(currentItemIndexForModal, 'assignedTo', tempSelectedMembers); } setIsMemberModalVisible(false); setCurrentItemIndexForModal(null); };
  const toggleFriendSelectionForExpense = (friendUid) => setSelectedFriendsForExpense(prev => prev.includes(friendUid) ? prev.filter(uid => uid !== friendUid) : [...prev, friendUid]);

  const renderExactAmountInputs = (forPersonalExpense = false) => {
    const isLoading = forPersonalExpense ? loadingFriends : loadingGroupDetails;
    let membersToList = [];
    if (forPersonalExpense) {
        const payerInList = {uid: personalExpensePayerUid, name: usernamesMap[personalExpensePayerUid] || currentUserDetails?.name || 'Payer'};
        membersToList = [payerInList];
        selectedFriendsForExpense.forEach(friendUid => {
            if (friendUid !== personalExpensePayerUid) {
                membersToList.push({uid: friendUid, name: usernamesMap[friendUid] || acceptedFriendsList.find(f=>f.uid === friendUid)?.name || 'Friend'});
            }
        });
    } else { membersToList = selectedGroupDetails?.members; }

    const amountsState = forPersonalExpense ? exactAmountsForPersonal : exactAmounts;
    const handler = forPersonalExpense ? (uid,val) => handleExactAmountChange(uid,val,true) : (uid,val) => handleExactAmountChange(uid,val,false);

    if (isLoading && splitMethod === 'exact') return <PaperActivityIndicator animating={true} color={theme.colors.primary} style={styles.loader}/>;
    if (!membersToList || membersToList.length === 0 || splitMethod !== 'exact') {
      return splitMethod === 'exact' ? <PaperText style={styles.infoText}>Select participants to split by exact amounts.</PaperText> : null;
    }
    return membersToList.map(member => (
      <View key={member.uid} style={styles.exactAmountRow}>
        <PaperText style={styles.memberNameLabel}>{member.name || member.email}:</PaperText>
        <PaperTextInput style={styles.exactAmountInput} placeholder="0.00" value={amountsState[member.uid] !== undefined ? String(amountsState[member.uid]) : ''} onChangeText={(value) => handler(member.uid, value)} keyboardType="numeric" mode="outlined" dense disabled={submitting}/>
      </View>));
  };

  const renderItemizedInputs = () => {
    if (loadingGroupDetails && splitMethod === 'itemized') return <PaperActivityIndicator animating={true} color={theme.colors.primary} style={styles.loader}/>;
    if (splitMethod !== 'itemized' || selectedGroupId === 'personal') return null;
    if (!selectedGroupDetails || !selectedGroupDetails.members || selectedGroupDetails.members.length === 0) {
        return <PaperText style={styles.infoText}>Select a group with accepted members to itemize.</PaperText>;
    }
    return (
      <View style={styles.itemizedContainer}>
        {currentItems.map((item, index) => (
          <View key={item.id} style={styles.itemRow}>
            <PaperTextInput label="Item" dense mode="outlined" placeholder="Name" value={item.itemName} onChangeText={val => handleItemChange(index, 'itemName', val)} style={[styles.itemInput, styles.itemNameInput]} disabled={submitting}/>
            <PaperTextInput label="Amt" dense mode="outlined" placeholder="0.00" value={item.itemAmount} onChangeText={val => handleItemChange(index, 'itemAmount', val)} style={[styles.itemInput, styles.itemAmountInput]} keyboardType="numeric" disabled={submitting}/>
            <TouchableOpacity onPress={() => openMemberAssignmentModal(index)} style={[styles.assignButton, {backgroundColor: theme.colors.surfaceVariant}]} disabled={submitting}><PaperText style={styles.assignButtonText}>{item.assignedTo.length} assigned</PaperText></TouchableOpacity>
            <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={styles.removeItemButton} disabled={submitting}><AntDesign name="minuscircleo" size={24} color={theme.colors.error} /></TouchableOpacity>
          </View>
        ))}
        <PaperButton mode="outlined" onPress={handleAddItem} icon="plus-circle-outline" style={{alignSelf: 'flex-start', marginTop:5}} labelStyle={{fontSize:14}} disabled={submitting}>Add Item</PaperButton>
      </View>
    );
  };

  const renderPersonalShareSection = () => {
    if (selectedGroupId !== "personal") return null;

    return (
      <View style={[styles.splitSection, {backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline}]}>
        <PaperText variant="titleMedium" style={styles.subSectionTitle}>Share with Friends (Optional)</PaperText>
        <PaperButton
            mode={selectedFriendsForExpense.length > 0 ? "contained-tonal" : "outlined"}
            icon="account-multiple-plus-outline"
            onPress={()=>setIsFriendSelectorModalVisible(!isFriendSelectorModalVisible)}
            style={{marginBottom:15}}
            disabled={submitting || loadingFriends || acceptedFriendsList.length === 0}
        >
            {selectedFriendsForExpense.length > 0 ? `Sharing with ${selectedFriendsForExpense.length} friend(s)` : "Select Friends"}
        </PaperButton>
        {loadingFriends && <PaperActivityIndicator animating={true} color={theme.colors.primary} />}
        {!loadingFriends && acceptedFriendsList.length === 0 && <PaperText style={styles.infoText}>No friends to share with. Add friends via the 'Friends' screen.</PaperText>}

        {selectedFriendsForExpense.length > 0 && (
          <View>
            <PaperText style={styles.label}>Payer for this expense:</PaperText>
            <View style={[styles.pickerContainer, {backgroundColor: theme.colors.surface}]}>
              <Picker selectedValue={personalExpensePayerUid} onValueChange={val => setPersonalExpensePayerUid(val)} style={styles.picker} enabled={!submitting}>
                <Picker.Item label={`You (${currentUserDetails?.name})`} value={currentUserDetails?.uid} />
                {selectedFriendsForExpense.map(friendUid => {
                  const friend = acceptedFriendsList.find(f => f.uid === friendUid);
                  return <Picker.Item key={friendUid} label={friend?.name || 'Friend'} value={friendUid} />;
                })}
              </Picker>
            </View>
            <PaperText style={styles.label}>Split Method:</PaperText>
            <View style={styles.radioContainer}>
              <RadioButton.Group onValueChange={val => setSplitMethod(val)} value={splitMethod}>
                <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('equal');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="equal" disabled={submitting}/><PaperText style={styles.radioLabel}>Equally</PaperText></View></TouchableOpacity>
                <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('exact');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="exact" disabled={submitting}/><PaperText style={styles.radioLabel}>Exact Amounts</PaperText></View></TouchableOpacity>
              </RadioButton.Group>
            </View>
            {splitMethod === 'exact' && renderExactAmountInputs(true)}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.scrollView, {backgroundColor: theme.colors.background}]} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <PaperText variant="headlineSmall" style={[styles.screenTitle, {color: theme.colors.primary}]}>Add New Expense</PaperText>

      <PaperTextInput label="Description" mode="outlined" placeholder="e.g., Groceries, Movie Tickets" value={description} onChangeText={setDescription} disabled={submitting} style={styles.inputField}/>
      <PaperTextInput label="Total Amount" mode="outlined" placeholder="0.00" value={String(amount)}
        onChangeText={val => {if (splitMethod !== 'itemized' || selectedGroupId === 'personal') setAmount(val);}}
        keyboardType="numeric"
        editable={(splitMethod !== 'itemized' || selectedGroupId === 'personal') && !submitting}
        style={styles.inputField}
      />

      <PaperText style={styles.label}>Expense Type</PaperText>
      <View style={[styles.pickerContainer, {backgroundColor: theme.colors.surface}]}>
        <Picker selectedValue={selectedGroupId}
          onValueChange={val => {
            setSelectedGroupId(val); setSplitMethod('equal'); setCurrentItems([]); setSelectedFriendsForExpense([]);
            if(currentUserDetails) setPersonalExpensePayerUid(currentUserDetails.uid);
            setExactAmounts({}); setExactAmountsForPersonal({});
          }}
          style={styles.picker} enabled={!submitting}>
          <Picker.Item label="Personal Expense" value="personal" />
          {userGroups.map(group => (<Picker.Item key={group.id} label={group.name} value={group.id} />))}
        </Picker>
      </View>

      {selectedGroupId && selectedGroupId !== "personal" && (
        <View style={[styles.splitSection, {backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline}]}>
          <PaperText variant="titleMedium" style={styles.subSectionTitle}>Group Split Options</PaperText>
          <View style={styles.radioContainer}>
            <RadioButton.Group onValueChange={newValue => {setSplitMethod(newValue); if(newValue !== 'itemized') setCurrentItems([]);}} value={splitMethod}>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('equal'); if(splitMethod === 'itemized' && selectedGroupId !== 'personal') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="equal" disabled={submitting}/><PaperText style={styles.radioLabel}>Equally</PaperText></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting){setSplitMethod('exact'); if(splitMethod === 'itemized' && selectedGroupId !== 'personal') setCurrentItems([]);}}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="exact" disabled={submitting}/><PaperText style={styles.radioLabel}>Exact Amounts</PaperText></View></TouchableOpacity>
              <TouchableOpacity style={styles.radioButtonTouchable} onPress={() => {if(!submitting)setSplitMethod('itemized');}} disabled={submitting}><View style={styles.radioButtonInner}><RadioButton value="itemized" disabled={submitting}/><PaperText style={styles.radioLabel}>Itemized</PaperText></View></TouchableOpacity>
            </RadioButton.Group>
          </View>
          {splitMethod === 'exact' && renderExactAmountInputs(false)}
          {splitMethod === 'itemized' && renderItemizedInputs()}
        </View>
      )}

      {selectedGroupId === "personal" && renderPersonalShareSection()}

      <PaperButton mode="contained" onPress={handleAddExpense} disabled={submitting || loadingGroupDetails || loadingFriends} style={{marginTop: 25, paddingVertical: 8}} labelStyle={{fontSize:16}}>
        {submitting ? "Adding..." : "Add Expense"}
      </PaperButton>

      {/* Modals */}
      <Portal>
        {/* Item Member Assignment Modal */}
        {selectedGroupDetails?.members?.length > 0 && splitMethod==='itemized' && selectedGroupId !== 'personal' && (
          <Dialog visible={isMemberModalVisible} onDismiss={() => setIsMemberModalVisible(false)}>
            <Dialog.Title>Assign Members to Item</Dialog.Title>
            <Dialog.ScrollArea style={{maxHeight: 300, paddingHorizontal:0}}>
              <ScrollView>
              {selectedGroupDetails.members.map(member => (
                <TouchableOpacity key={member.uid} style={styles.memberSelectItem} onPress={() => handleMemberSelectionForItem(member.uid)}>
                  <PaperText style={styles.memberNameModal}>{member.name || member.email}</PaperText>
                  <RadioButton value={member.uid} status={tempSelectedMembers.includes(member.uid) ? 'checked' : 'unchecked'} onPress={() => handleMemberSelectionForItem(member.uid)}/>
                </TouchableOpacity>))}
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <PaperButton onPress={() => setIsMemberModalVisible(false)}>Cancel</PaperButton>
              <PaperButton onPress={confirmMemberAssignment}>Confirm</PaperButton>
            </Dialog.Actions>
          </Dialog>
        )}

        {/* Friend Selector Modal */}
        <Dialog visible={isFriendSelectorModalVisible} onDismiss={() => setIsFriendSelectorModalVisible(false)}>
          <Dialog.Title>Share with Friends</Dialog.Title>
          <Dialog.ScrollArea style={{maxHeight: 300, paddingHorizontal:0}}>
            {loadingFriends ? <PaperActivityIndicator animating={true} color={theme.colors.primary}/> : acceptedFriendsList.length === 0 ? <PaperText style={styles.infoText}>No friends found.</PaperText> :
              <ScrollView>
              {acceptedFriendsList.map(friend => (
                <TouchableOpacity key={friend.uid} style={styles.memberSelectItem} onPress={() => toggleFriendSelectionForExpense(friend.uid)}>
                  <PaperText style={styles.memberNameModal}>{friend.name}</PaperText>
                  <RadioButton value={friend.uid} status={selectedFriendsForExpense.includes(friend.uid) ? 'checked' : 'unchecked'} />
                </TouchableOpacity>))}
              </ScrollView>
            }
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <PaperButton onPress={() => setIsFriendSelectorModalVisible(false)}>Done</PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, /* backgroundColor from theme */ },
  scrollContentContainer: { padding: 20, paddingBottom: 50 },
  screenTitle: { textAlign: 'center', marginBottom: 25 },
  label: { fontSize: 16, marginBottom: 6, fontWeight: '500', /* color from PaperText variant or theme */ },
  inputField: { marginBottom: 18, backgroundColor:'transparent', /* Outlined inputs have their own bg */},
  pickerContainer: { borderWidth: 1, borderRadius: 8, marginBottom: 20, /* borderColor from theme */ },
  picker: { height: 50 },
  splitSection: { marginTop: 15, marginBottom:20, padding:15, borderRadius:8, borderWidth:1, },
  subSectionTitle: {marginBottom:12, fontSize: 16, fontWeight:'500'},
  radioContainer: { flexDirection: 'column', marginBottom: 10, },
  radioButtonTouchable: { paddingVertical: 6, }, // Make whole row tappable
  radioButtonInner: {flexDirection:'row', alignItems:'center'},
  radioLabel: { fontSize: 16, marginLeft: 8, /* color from theme */ },
  infoText: { textAlign: 'center', marginVertical: 10, fontSize: 14, /* color from theme.colors.textSecondary */ },
  loader: { marginVertical: 15 },
  exactAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingVertical:5, borderBottomWidth:1, /* borderBottomColor from theme */},
  memberNameLabel: { fontSize: 15, flex: 0.6, /* color from theme */ },
  exactAmountInput: { flex: 0.4, textAlign: 'right', backgroundColor:'transparent'}, // Using PaperTextInput, so less styling needed here
  itemizedContainer: { marginVertical: 10, padding: 15, borderRadius: 8, borderWidth:1, },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
  itemInput: { marginBottom: 0, backgroundColor:'transparent', height:50, }, // Common style for item inputs
  itemNameInput: { flex: 1, marginRight: 8 },
  itemAmountInput: { width: 100, marginRight: 8, textAlign: 'right' },
  assignButton: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 5, alignItems: 'center', justifyContent:'center', height:50, marginRight: 8},
  assignButtonText: {fontSize: 13, textAlign:'center', /* color from theme */},
  removeItemButton: {padding:5, justifyContent:'center', alignItems:'center', height:50},
  // Modal styles are now part of Paper.Dialog, but container for Dialog.ScrollArea might be needed
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }, // Kept for Modal wrapper if Portal not used or for bg dim
  modalContent: { backgroundColor: 'white', padding: 25, borderRadius: 10, width: '90%', maxHeight: '85%', elevation: 5}, // For react-native Modal
  modalTitle: { marginBottom: 20, textAlign: 'center' },
  memberSelectItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, /* borderBottomColor from theme */ },
  memberNameModal: {fontSize: 16, /* color from theme */},
  modalButtonContainer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 25 },
});

export default AddExpenseScreen;
