import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { firebase } from '../../firebaseConfig';
import {
    Text as PaperText,
    useTheme,
    ActivityIndicator as PaperActivityIndicator,
    Button as PaperButton,
    TextInput as PaperTextInput,
    Chip as PaperChip,
    Modal as PaperModal,
    Portal,
    SegmentedButtons,
    Divider,
    Checkbox,
    List as PaperList
} from 'react-native-paper';
// import DateTimePicker from '@react-native-community/datetimepicker'; // Replaced by Paper Dates DatePickerModal
import { DatePickerModal, enGB, registerTranslation } from 'react-native-paper-dates'; // Import Paper Dates
registerTranslation('en-GB', enGB); // Register a locale (optional, can use default 'en')

import { fetchUsernames } from '../utils/userUtils';
import { AntDesign } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { format } from 'date-fns'; // For formatting the date to display

// formatDate helper is now using date-fns for more robust formatting
const formatDateForDisplay = (date) => {
  if (!date) return '';
  return format(date, 'MMM dd, yyyy'); // e.g., "Oct 23, 2023"
};

function AddExpenseScreen({ navigation }) {
  const theme = useTheme();
  const [currentUserDetails, setCurrentUserDetails] = useState(null);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date()); // Stores JS Date object

  const [payerName, setPayerName] = useState('You');
  const [splitConfiguration, setSplitConfiguration] = useState({ /* ... initial config ... */
    type: 'personal_solo', paidByUid: '', involvedUsers: [], splitMethod: 'equal',
    groupId: null, groupName: null, memberOwes: {}, items: [], amountPerMember: 0,
  });
  const [splitSummaryText, setSplitSummaryText] = useState('Loading...');

  const [isSplitModalVisible, setIsSplitModalVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false); // State for Paper DatePickerModal
  const [submitting, setSubmitting] = useState(false);

  // Temporary states for modal
  const [tempExpenseType, setTempExpenseType] = useState('personal_solo');
  const [tempPayerUid, setTempPayerUid] = useState('');
  const [tempSelectedGroupId, setTempSelectedGroupId] = useState('');
  const [tempSelectedFriends, setTempSelectedFriends] = useState([]);
  const [tempSplitMethod, setTempSplitMethod] = useState('equal');
  const [tempMemberOwes, setTempMemberOwes] = useState({});
  const [tempItems, setTempItems] = useState([]);

  const [userGroups, setUserGroups] = useState([]);
  const [acceptedFriendsList, setAcceptedFriendsList] = useState([]);
  const [modalPayerOptions, setModalPayerOptions] = useState([]);
  const [modalGroupMembers, setModalGroupMembers] = useState([]);
  const [loadingModalData, setLoadingModalData] = useState(false);
  const [usernamesMap, setUsernamesMap] = useState({});

  // --- useEffect Hooks for data fetching and setup ---
  useEffect(() => { /* ... (Fetch current user, groups, friends - as before) ... */
    const user = firebase.auth().currentUser;
    if (!user) { Alert.alert("Auth Error", "Please login."); navigation.navigate('Login'); return; }
    const userDocRef = firebase.firestore().collection('users').doc(user.uid);
    userDocRef.get().then(doc => {
      let name = user.email.split('@')[0];
      if (doc.exists && doc.data().name) name = doc.data().name;
      const userDetails = { uid: user.uid, email: user.email, name: name };
      setCurrentUserDetails(userDetails);
      // setPaidByUid(user.uid); // This was for main screen direct payer, now managed by splitConfig
      setPayerName(name); // Set based on initial config
      setTempPayerUid(user.uid);
      setSplitConfiguration(prev => ({...prev, paidByUid: user.uid, involvedUsers: [{uid: user.uid, name: name}]}));
      setUsernamesMap(prev => ({...prev, [user.uid]: name}));
    });
    firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: user.uid, status: 'accepted', email: user.email })
      .onSnapshot(snap => setUserGroups(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }))),
                  err => console.error("Error fetching groups:", err));
    firebase.firestore().collection('friendships')
        .where('userUids', 'array-contains', user.uid).where('status', '==', 'accepted')
        .get().then(async snapshot => {
            const friends = []; const friendUids = [];
            snapshot.forEach(doc => { const data = doc.data(); const friendUid = data.userUids.find(uid => uid !== user.uid); if (friendUid) friendUids.push(friendUid); });
            if (friendUids.length > 0) {
                const names = await fetchUsernames(friendUids);
                friendUids.forEach(uid => friends.push({ uid, name: names[uid] || 'Friend' }));
                setUsernamesMap(prev => ({...prev, ...names}));
            }
            setAcceptedFriendsList(friends);
        }).catch(err => console.error("Error fetching friends:", err));
  }, [navigation]);

  useEffect(() => { /* ... (Update Payer options for Modal - as before) ... */
    if (!currentUserDetails) return;
    let options = [{ label: `You (${currentUserDetails.name})`, value: currentUserDetails.uid }];
    if (tempExpenseType === 'group' && modalGroupMembers.length > 0) {
      options = modalGroupMembers.map(m => ({ label: m.name, value: m.uid }));
      if (!modalGroupMembers.find(m => m.uid === tempPayerUid) && options.length > 0) setTempPayerUid(options[0].value);
      else if (modalGroupMembers.length === 0) setTempPayerUid('');
    } else if (tempExpenseType === 'personal_friends' && tempSelectedFriends.length > 0) {
      const friendDetails = tempSelectedFriends.map(uid => {
        const friend = acceptedFriendsList.find(f => f.uid === uid) || {name: usernamesMap[uid] || 'Friend'};
        return { label: friend.name, value: uid };
      });
      options = [...options, ...friendDetails];
      if (!options.find(opt => opt.value === tempPayerUid)) setTempPayerUid(currentUserDetails.uid);
    } else { if(tempPayerUid !== currentUserDetails.uid) setTempPayerUid(currentUserDetails.uid); }
    setModalPayerOptions(options);
  }, [tempExpenseType, modalGroupMembers, tempSelectedFriends, currentUserDetails, acceptedFriendsList, usernamesMap]);

  useEffect(() => { /* ... (Fetch group members for modal - as before) ... */
    if (tempExpenseType === 'group' && tempSelectedGroupId) {
      setLoadingModalData(true);
      const groupRef = firebase.firestore().collection('groups').doc(tempSelectedGroupId);
      groupRef.get().then(async doc => {
        if (doc.exists) {
          const groupDataFromDb = doc.data();
          const acceptedMembersRaw = groupDataFromDb.members.filter(m => m.status === 'accepted');
          const memberUids = acceptedMembersRaw.map(m => m.uid);
          let membersWithNames = [];
          if (memberUids.length > 0) {
            const namesMap = await fetchUsernames(memberUids);
            setUsernamesMap(prev => ({ ...prev, ...namesMap }));
            membersWithNames = acceptedMembersRaw.map(m => ({ ...m, name: namesMap[m.uid] || m.email }));
          }
          setModalGroupMembers(membersWithNames);
          if (memberUids.includes(currentUserDetails.uid)) setTempPayerUid(currentUserDetails.uid);
          else if (membersWithNames.length > 0) setTempPayerUid(membersWithNames[0].uid);
          else setTempPayerUid('');
        } setLoadingModalData(false);
      }).catch(err => { console.error(err); setLoadingModalData(false); });
    } else { setModalGroupMembers([]); }
  }, [tempExpenseType, tempSelectedGroupId, currentUserDetails?.uid]);

  useEffect(() => { /* ... (Auto-calculate total amount from items - as before) ... */
    if (isSplitModalVisible && tempExpenseType === 'group' && tempSplitMethod === 'itemized') {
      const total = tempItems.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
      setAmount(total > 0 ? total.toFixed(2) : '');
    } else if (!isSplitModalVisible && splitConfiguration.type === 'group' && splitConfiguration.splitMethod === 'itemized') {
      // Update main amount if config is itemized (after modal close)
      const total = splitConfiguration.items.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
      setAmount(total > 0 ? total.toFixed(2) : '');
    }
  }, [tempItems, tempSplitMethod, tempExpenseType, isSplitModalVisible, splitConfiguration]);

  // Update Split Summary Text
  useEffect(() => { /* ... (generateSplitSummaryText and update payerName - as before) ... */
    if (currentUserDetails) {
        let nameForSummary = 'You'; // Default
        if (splitConfiguration.paidByUid === currentUserDetails.uid) {
            nameForSummary = currentUserDetails.name || 'You';
        } else {
            nameForSummary = usernamesMap[splitConfiguration.paidByUid] ||
                             acceptedFriendsList.find(f=>f.uid === splitConfiguration.paidByUid)?.name ||
                             modalGroupMembers.find(m=>m.uid === splitConfiguration.paidByUid)?.name ||
                             'Someone';
        }
        setPayerName(nameForSummary);
        setSplitSummaryText(generateSplitSummaryText(splitConfiguration, nameForSummary, usernamesMap, userGroups));
    }
  }, [splitConfiguration, currentUserDetails, usernamesMap, userGroups, acceptedFriendsList, modalGroupMembers]); // Added acceptedFriendsList & modalGroupMembers

  // Helper to generate split summary text
  const generateSplitSummaryText = (config, pName, uMap, gList) => { /* ... (as before) ... */
    if (!config || !pName) return "Loading...";
    let summary = `Paid by ${pName}. `;
    switch (config.type) {
      case 'personal_solo': summary += "Just for you."; break;
      case 'personal_shared':
        const friends = config.involvedUsers?.filter(u => u.uid !== config.paidByUid) || [];
        if (friends.length > 0) {
            const friendNames = friends.map(u => uMap[u.uid] || u.name || 'Friend').join(', ');
            summary += `Shared with ${friendNames} (${config.splitMethod}).`;
        } else { summary += "Personal expense."; }
        break;
      case 'group':
        const group = gList.find(g => g.id === config.groupId);
        summary += `For group '${group?.name || config.groupName || 'Unknown Group'}'. Split ${config.splitMethod}.`; break;
      default: summary = "Custom split.";
    }
    return summary;
  };

  const openAdvancedSplitModal = () => { /* ... (Initialize temp states from splitConfiguration - as before) ... */
    setTempExpenseType(splitConfiguration.type || 'personal_solo');
    setTempPayerUid(splitConfiguration.paidByUid || currentUserDetails?.uid);
    setTempSelectedGroupId(splitConfiguration.groupId || '');
    if (splitConfiguration.type === 'personal_shared' && Array.isArray(splitConfiguration.involvedUsers)) {
        setTempSelectedFriends(splitConfiguration.involvedUsers.map(u=>u.uid).filter(uid => uid !== (splitConfiguration.paidByUid || currentUserDetails?.uid)));
    } else { setTempSelectedFriends([]); }
    setTempSplitMethod(splitConfiguration.splitMethod || 'equal');
    setTempMemberOwes(splitConfiguration.memberOwes || {});
    setTempItems(splitConfiguration.items?.map((item, index) => ({...item, id: item.id || `temp-${index}-${Date.now()}`)) || []);
    setIsSplitModalVisible(true);
  };

  const handleApplySplitOptions = () => { /* ... (Construct newConfig and setSplitConfiguration - as before) ... */
    let newConfig = { type: tempExpenseType, paidByUid: tempPayerUid, splitMethod: tempSplitMethod,
      memberOwes: tempSplitMethod === 'exact' ? tempMemberOwes : {},
      items: tempSplitMethod === 'itemized' ? tempItems.map(({id, ...rest})=>rest) : [],
      groupId: tempExpenseType === 'group' ? tempSelectedGroupId : null,
      groupName: tempExpenseType === 'group' ? (userGroups.find(g=>g.id === tempSelectedGroupId)?.name || '') : null,
      involvedUsers: [], amountPerMember: 0,
    };
    if (tempExpenseType === 'personal_solo') {
      newConfig.involvedUsers = [{ uid: tempPayerUid, name: modalPayerOptions.find(p=>p.value===tempPayerUid)?.label || 'Payer'}];
    } else if (tempExpenseType === 'personal_shared') {
      const payerInfo = modalPayerOptions.find(p=>p.value===tempPayerUid) || {name: 'Payer', uid: tempPayerUid};
      newConfig.involvedUsers = [payerInfo, ...tempSelectedFriends.map(uid => ({uid, name: acceptedFriendsList.find(f=>f.uid===uid)?.name || usernamesMap[uid] || 'Friend'}))];
      newConfig.involvedUsers = Array.from(new Map(newConfig.involvedUsers.map(item => [item.uid, item])).values());
      if (tempSplitMethod === 'equal' && newConfig.involvedUsers.length > 0 && parseFloat(amount)>0) newConfig.amountPerMember = parseFloat(amount) / newConfig.involvedUsers.length;
    } else if (tempExpenseType === 'group') {
      newConfig.involvedUsers = modalGroupMembers.map(m => ({uid: m.uid, name: m.name}));
      if (tempSplitMethod === 'equal' && modalGroupMembers.length > 0 && parseFloat(amount)>0) newConfig.amountPerMember = parseFloat(amount) / modalGroupMembers.length;
    }
    setSplitConfiguration(newConfig);
    setIsSplitModalVisible(false);
  };

  // Date Picker Logic
  const onDateChange = useCallback((event, selectedDate) => {
    setIsDatePickerVisible(Platform.OS === 'ios'); // Keep visible on iOS until done, or use a confirm button
    if (selectedDate) {
      setDate(selectedDate);
    }
    if (Platform.OS !== 'ios') setIsDatePickerVisible(false); // Auto-close on Android
  }, [date]); // Include date if you want to reset to `date` if `selectedDate` is undefined

  const showDatePicker = useCallback(() => setIsDatePickerVisible(true), []);
  const hideDatePicker = useCallback(() => setIsDatePickerVisible(false), []);


  const handleSaveExpense = async () => { /* ... (Full save logic as before) ... */
    setSubmitting(true);
    if (!currentUserDetails) { Alert.alert("Auth Error", "User details missing."); setSubmitting(false); return; }
    if (!description.trim()) { Alert.alert("Validation Error", "Description is required."); setSubmitting(false); return; }
    const isFinalItemGroupItemized = splitConfiguration.type === 'group' && splitConfiguration.splitMethod === 'itemized';
    let finalAmount = parseFloat(amount);
    if (isFinalItemGroupItemized) {
        finalAmount = splitConfiguration.items.reduce((sum, item) => sum + (parseFloat(item.itemAmount) || 0), 0);
        if (finalAmount <= 0) { Alert.alert("Validation Error", "Total for itemized expense must be positive."); setSubmitting(false); return;}
    } else { if (isNaN(finalAmount) || finalAmount <= 0) { Alert.alert("Validation Error", "Amount must be a positive number."); setSubmitting(false); return;} }
    let finalExpenseData = { description: description.trim(), amount: finalAmount, date: firebase.firestore.Timestamp.fromDate(date),
      paidByUid: splitConfiguration.paidByUid, splitType: splitConfiguration.type === 'personal_solo' ? 'personal_solo' : splitConfiguration.splitMethod,
      groupId: splitConfiguration.groupId, involvedUids: splitConfiguration.involvedUsers.map(u => u.uid),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), userId: currentUserDetails.uid, };
    if (splitConfiguration.splitMethod === 'exact') finalExpenseData.memberOwes = splitConfiguration.memberOwes;
    else if (isFinalItemGroupItemized) {
        finalExpenseData.items = splitConfiguration.items;
        finalExpenseData.memberOwes = {};
        splitConfiguration.items.forEach(item => { const itemAmt = parseFloat(item.itemAmount); if (item.assignedTo.length > 0) { const share = itemAmt / item.assignedTo.length; item.assignedTo.forEach(uid => finalExpenseData.memberOwes[uid] = (finalExpenseData.memberOwes[uid] || 0) + share);}});
    } else if (splitConfiguration.splitMethod === 'equal') finalExpenseData.amountPerMember = splitConfiguration.amountPerMember;
    if (finalExpenseData.splitType === 'personal_solo') finalExpenseData.involvedUids = [finalExpenseData.paidByUid];
    try {
        await firebase.firestore().collection('expenses').add(finalExpenseData);
        Alert.alert("Expense Added", `Description: ${description}, Amount: ${finalAmount.toFixed(2)}`);
        setDescription(''); setAmount(''); setDate(new Date());
        if(currentUserDetails) { setSplitConfiguration({ type: 'personal_solo', paidByUid: currentUserDetails.uid, involvedUsers: [{uid:currentUserDetails.uid, name:currentUserDetails.name}], splitMethod:'equal', splitMethodForDisplay: 'Just for you'}); setPayerName(currentUserDetails.name); }
    } catch (error) { console.error(error); Alert.alert("Error", "Could not add expense: " + error.message); }
    setSubmitting(false);
  };

  // --- Itemization specific functions for the modal (mostly same) ---
  const handleAddItemToModal = () => setTempItems([...tempItems, { id: Date.now().toString() + Math.random().toString(36).substr(2, 5), itemName: '', itemAmount: '', assignedTo: [] }]);
  const handleModalItemChange = (index, field, value) => { const newItems = [...tempItems]; newItems[index][field] = value; setTempItems(newItems); };
  const handleRemoveModalItem = (idToRemove) => setTempItems(tempItems.filter(item => item.id !== idToRemove));
  const openItemMemberAssignModal = (index) => { setAssigningItemIndex(index); setTempItemAssignedMembers(tempItems[index].assignedTo || []); setIsItemMemberAssignVisible(true); };
  const handleItemMemberSelectionInModal = (uid) => setTempItemAssignedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  const confirmItemMemberAssignmentInModal = () => { if (assigningItemIndex !== null) { handleModalItemChange(assigningItemIndex, 'assignedTo', tempItemAssignedMembers); } setIsItemMemberAssignVisible(false); setAssigningItemIndex(null);};
  const toggleFriendSelectionForExpense = (friendUid) => setSelectedFriendsForExpense(prev => prev.includes(friendUid) ? prev.filter(uid => uid !== friendUid) : [...prev, friendUid]);

  const renderModalExactAmountInputs = () => { /* ... (as before) ... */
    let membersForExact = [];
    if (tempExpenseType === 'group') membersForExact = modalGroupMembers;
    else if (tempExpenseType === 'personal_friends') {
        const payerInList = {uid: tempPayerUid, name: modalPayerOptions.find(p=>p.value === tempPayerUid)?.label || 'Payer'};
        membersForExact = [payerInList];
        tempSelectedFriends.forEach(friendUid => { if (friendUid !== tempPayerUid) membersForExact.push({uid: friendUid, name: acceptedFriendsList.find(f=>f.uid === friendUid)?.name || usernamesMap[friendUid] || 'Friend'}); });
        membersForExact = Array.from(new Map(membersForExact.map(item => [item.uid, item])).values());
    }
    if (membersForExact.length === 0 && tempSplitMethod === 'exact') return <PaperText style={styles.modalInfoText}>Select participants first.</PaperText>;
    if (tempSplitMethod !== 'exact') return null;
    return membersForExact.map(member => ( <PaperTextInput key={member.uid} label={member.name} mode="outlined" dense style={{marginBottom:5}} value={tempMemberOwes[member.uid] !== undefined ? String(tempMemberOwes[member.uid]) : ''} onChangeText={val => setTempMemberOwes(prev => ({...prev, [member.uid]: val}))} keyboardType="numeric" placeholder="0.00" /> ));
  };
  const renderModalItemizedInputs = () => { /* ... (as before) ... */
    if (tempSplitMethod !== 'itemized' || tempExpenseType !== 'group') return null;
    if (loadingModalData) return <PaperActivityIndicator/>;
    if (modalGroupMembers.length === 0) return <PaperText style={styles.modalInfoText}>Group has no members for itemization.</PaperText>;
    return ( <View style={styles.itemizedContainerModal}> {tempItems.map((item, index) => ( <View key={item.id} style={styles.itemRowModal}> <PaperTextInput label="Item" dense mode="outlined" value={item.itemName} onChangeText={val => handleModalItemChange(index, 'itemName', val)} style={styles.itemNameInputModal}/> <PaperTextInput label="Amount" dense mode="outlined" value={item.itemAmount} onChangeText={val => handleModalItemChange(index, 'itemAmount', val)} style={styles.itemAmountInputModal} keyboardType="numeric"/> <TouchableOpacity onPress={() => openItemMemberAssignModal(index)} style={[styles.assignButtonModal, {backgroundColor: theme.colors.surfaceVariant}]}><PaperText style={styles.assignButtonTextModal}>{item.assignedTo.length || 0} assigned</PaperText></TouchableOpacity> <TouchableOpacity onPress={() => handleRemoveModalItem(item.id)}><AntDesign name="minuscircleo" size={24} color={theme.colors.error} /></TouchableOpacity> </View> ))} <PaperButton mode="outlined" icon="plus-circle-outline" onPress={handleAddItemToModal} style={{alignSelf: 'flex-start', marginTop:5}} labelStyle={{fontSize:14}}>Add Item</PaperButton> </View> );
  };

  if (!currentUserDetails) return <View style={[styles.container, styles.centered]}><PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" /></View>;

  return (
    <ScrollView style={[styles.scrollView, {backgroundColor: theme.colors.background}]} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <PaperText variant="headlineSmall" style={[styles.screenTitle, {color: theme.colors.primary}]}>Add New Expense</PaperText>
      <PaperTextInput label="Description" mode="outlined" value={description} onChangeText={setDescription} style={styles.inputField} disabled={submitting}/>
      <PaperTextInput label="Amount" mode="outlined" placeholder="0.00" value={amount}
        onChangeText={setAmount} keyboardType="numeric" style={styles.inputField}
        disabled={submitting || (isSplitModalVisible && tempExpenseType === 'group' && tempSplitMethod === 'itemized')}
        editable={!(isSplitModalVisible && tempExpenseType === 'group' && tempSplitMethod === 'itemized')}
        left={<PaperTextInput.Affix text="$" />}
      />
      <TouchableOpacity onPress={showDatePicker} disabled={submitting}>
        <PaperTextInput label="Date" mode="outlined" value={formatDateForDisplay(date)} editable={false} right={<PaperTextInput.Icon icon="calendar" onPress={showDatePicker} disabled={submitting}/>} style={styles.inputField}/>
      </TouchableOpacity>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}><PaperText variant="titleMedium" style={{color: theme.colors.onSurfaceVariant}}>Paid by: </PaperText><PaperChip icon="account-circle" style={{backgroundColor: theme.colors.surfaceVariant}} textStyle={{color: theme.colors.onSurfaceVariant}}>{payerName}</PaperChip></View>
        <View style={styles.summaryRow}><PaperText variant="titleMedium" style={{color: theme.colors.onSurfaceVariant}}>Split: </PaperText><PaperText variant="bodyLarge" style={{color: theme.colors.onSurface, flexShrink: 1}}>{splitSummaryText}</PaperText></View>
      </View>

      <PaperButton mode="outlined" icon="cog-outline" onPress={openAdvancedSplitModal} style={styles.splitOptionsButton} disabled={submitting}>Sharing & Splitting Options</PaperButton>
      <PaperButton mode="contained" onPress={handleSaveExpense} disabled={submitting} loading={submitting} style={styles.saveButton} labelStyle={{fontSize:16, paddingVertical:5}}>{submitting ? "Saving..." : "Save Expense"}</PaperButton>

      {isDatePickerVisible && ( <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} /> )}

      <Portal>
        <PaperModal visible={isSplitModalVisible} onDismiss={() => setIsSplitModalVisible(false)} contentContainerStyle={[styles.modalContentContainer, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness * 1.5}]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <PaperText variant="titleLarge" style={styles.modalTitle}>Sharing & Splitting Options</PaperText>
            <PaperText variant="titleMedium" style={styles.modalSectionTitle}>Share With:</PaperText>
            <SegmentedButtons value={tempExpenseType} onValueChange={val => {setTempExpenseType(val); setTempSplitMethod('equal'); setTempItems([]); setTempMemberOwes({}); setTempSelectedFriends([]); if(val==='group') setTempSelectedGroupId('');}} density='medium' buttons={[ { value: 'personal_solo', label: 'Just Me' }, { value: 'group', label: 'Group' }, { value: 'personal_friends', label: 'Friends' }]} style={{marginBottom:15}}/>

            {tempExpenseType === 'group' && ( <View style={styles.modalPickerContainer}><Picker selectedValue={tempSelectedGroupId} onValueChange={(itemValue) => {setTempSelectedGroupId(itemValue); setTempSplitMethod('equal'); setTempItems([]); setTempMemberOwes({});}}><Picker.Item label="Select Group..." value="" />{userGroups.map(group => (<Picker.Item key={group.id} label={group.name} value={group.id} />))}</Picker></View> )}
            {tempExpenseType === 'personal_friends' && ( <View style={{maxHeight:150, marginBottom:15, borderWidth:1, borderColor:theme.colors.outline, borderRadius:theme.roundness}}><PaperText style={styles.modalSubLabel}>Select friends:</PaperText>{loadingFriends ? <PaperActivityIndicator/> : acceptedFriendsList.length === 0 ? <PaperText style={styles.modalInfoText}>No friends found.</PaperText> : <FlatList data={acceptedFriendsList} keyExtractor={item => item.uid} renderItem={({item: friend}) => (<TouchableOpacity onPress={() => toggleFriendSelectionForExpense(friend.uid)}><PaperList.Item title={friend.name} style={styles.modalListItem} titleStyle={{fontSize:15}} right={() => <Checkbox status={tempSelectedFriends.includes(friend.uid) ? 'checked' : 'unchecked'}/>}/></TouchableOpacity>)}/>}</View> )}

            {((tempExpenseType === 'group' && tempSelectedGroupId) || (tempExpenseType === 'personal_friends' && tempSelectedFriends.length > 0) || tempExpenseType === 'personal_solo') && !loadingModalData && (
              <>
                <PaperText variant="titleMedium" style={styles.modalSectionTitle}>Paid By:</PaperText>
                <View style={styles.modalPickerContainer}><Picker selectedValue={tempPayerUid} onValueChange={setTempPayerUid} enabled={modalPayerOptions.length > 0}>{modalPayerOptions.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}</Picker></View>

                {tempExpenseType !== 'personal_solo' && // No split method for personal_solo
                  <>
                  <PaperText variant="titleMedium" style={styles.modalSectionTitle}>Split Method:</PaperText>
                  <SegmentedButtons value={tempSplitMethod} onValueChange={val => {setTempSplitMethod(val); setTempItems([]); setTempMemberOwes({});}} density='medium'
                    buttons={[ { value: 'equal', label: 'Equally' }, { value: 'exact', label: 'Exact Amounts' }, ...(tempExpenseType === 'group' ? [{ value: 'itemized', label: 'Itemized' }] : []) ]} style={{marginBottom:15}}/>
                  </>
                }

                {tempSplitMethod === 'exact' && renderModalExactAmountInputs()}
                {tempSplitMethod === 'itemized' && tempExpenseType === 'group' && renderModalItemizedInputs()}
              </>
            )}
            {loadingModalData && (tempExpenseType === 'group' || tempExpenseType === 'personal_friends') && <PaperActivityIndicator style={{marginVertical:10}}/>}

            <Divider style={{marginVertical:20, backgroundColor: theme.colors.outlineVariant}}/>
            <View style={{flexDirection:'row', justifyContent:'flex-end'}}>
              <PaperButton onPress={() => setIsSplitModalVisible(false)} style={{marginRight:10}} textColor={theme.colors.onSurfaceVariant}>Cancel</PaperButton>
              <PaperButton mode="contained" onPress={handleApplySplitOptions}>Done</PaperButton>
            </View>
          </ScrollView>
        </PaperModal>
      </Portal>

      <Portal>
        <Dialog visible={isItemMemberAssignVisible} onDismiss={() => setIsItemMemberAssignVisible(false)}>
            <Dialog.Title>Assign Members to Item</Dialog.Title>
            <Dialog.ScrollArea style={{maxHeight: 300, paddingHorizontal:0}}>
                <ScrollView>
                {(modalGroupMembers || []).map(member => (
                    <TouchableOpacity key={member.uid} style={styles.memberSelectItemModal} onPress={() => handleItemMemberSelectionInModal(member.uid)}>
                        <PaperText style={styles.memberNameModal}>{member.name}</PaperText>
                        <Checkbox status={tempItemAssignedMembers.includes(member.uid) ? 'checked' : 'unchecked'}/>
                    </TouchableOpacity>
                ))}
                </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
                <PaperButton onPress={() => setIsItemMemberAssignVisible(false)}>Cancel</PaperButton>
                <PaperButton onPress={confirmItemMemberAssignmentInModal}>Confirm</PaperButton>
            </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 }, scrollContentContainer: { padding: 20, paddingBottom: 50 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle: { textAlign: 'center', marginBottom: 25 },
  inputField: { marginBottom: 18, backgroundColor:'transparent'},
  summaryCard: { padding: 15, marginBottom: 16, elevation:1, borderWidth:1, /* borderColor from theme */},
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap:'wrap' },
  splitOptionsButton: { marginTop: 20, marginBottom: 24, paddingVertical: 8, },
  saveButton: { paddingVertical: 8, },
  modalContentContainer: { padding: 20, marginHorizontal: 10, maxHeight: '90%', },
  modalTitle: { textAlign: 'center', marginBottom: 20 },
  modalSectionTitle: { marginTop: 15, marginBottom: 10, fontSize: 16, fontWeight:'500' },
  modalPickerContainer: { borderWidth: 1, borderRadius: 8, marginBottom: 15, /* borderColor from theme */ },
  modalInfoText: { marginVertical:10, fontStyle:'italic', textAlign:'center'},
  modalListItem: {paddingVertical:0, paddingHorizontal:0},
  modalSubLabel: {marginBottom:5, fontSize:14, color:'grey'}, // Using theme.colors.onSurfaceVariant would be better
  exactAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, },
  memberNameLabel: { fontSize: 15, flex: 0.6, },
  exactAmountInput: { flex: 0.4, textAlign: 'right', height:45, backgroundColor:'transparent' },
  itemizedContainerModal: { marginVertical: 10, padding: 10, borderRadius: 8, borderWidth:1, },
  itemRowModal: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' },
  itemNameInputModal: { flex: 1, marginRight: 8, height:45, backgroundColor:'transparent' },
  itemAmountInputModal: { width: 100, marginRight: 8, textAlign: 'right', height:45, backgroundColor:'transparent' },
  assignButtonModal: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 5, alignItems: 'center', justifyContent:'center', height:45, marginRight: 8},
  assignButtonTextModal: {fontSize: 12, textAlign:'center'},
  memberSelectItemModal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, },
  memberNameModal: {fontSize: 16},
});

export default AddExpenseScreen;
