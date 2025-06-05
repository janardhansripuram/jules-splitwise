import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform, Switch, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledTextInput from '../components/StyledTextInput';
import StyledButton from '../components/StyledButton';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO, getDay, getDaysInMonth, setDate, setMonth, addDays, isLastDayOfMonth as dfnsIsLastDayOfMonth } from 'date-fns'; // Removed unused date-fns functions for now
import { fetchUsernames } from '../utils/userUtils';
import { RadioButton } from 'react-native-paper'; // For split type selection
import { AntDesign } from '@expo/vector-icons'; // For itemized remove icon

const COLORS = { /* Using palette from previous steps */
  background: '#f8f9fa', text: '#212529', primary: '#007bff', border: '#ced4da',
  textSecondary: '#6c757d', danger: '#dc3545', cardBackground: '#ffffff',
  disabled: '#e9ecef', subtleBackground: '#f0f0f0', success: '#28a745',
};

// calculateNextDueDateLogic remains the same
const calculateNextDueDateLogic = (startDate, frequency, dayOfWeek, dayOfMonth, month) => {
    let nextDate = new Date(startDate);
    nextDate.setHours(12,0,0,0);
    switch (frequency) {
        case 'Daily': return nextDate < new Date() ? new Date() : nextDate;
        case 'Weekly':
            if (dayOfWeek === null || dayOfWeek === undefined) return startDate;
            const currentDay = getDay(nextDate);
            let daysToAdd = dayOfWeek - currentDay;
            if (daysToAdd < 0) daysToAdd += 7;
            nextDate = addDays(nextDate, daysToAdd);
            return nextDate;
        case 'Monthly':
            if (dayOfMonth === null || dayOfMonth === undefined) return startDate;
            if (dayOfMonth === 'Last Day of Month') {
                nextDate = setDate(nextDate, getDaysInMonth(nextDate));
            } else {
                const targetDay = parseInt(dayOfMonth, 10);
                if (getDate(nextDate) > targetDay) nextDate = addMonths(nextDate, 1);
                nextDate = setDate(nextDate, Math.min(targetDay, getDaysInMonth(nextDate))); // Ensure valid day for month
            }
            return nextDate;
        case 'Yearly':
            if (month === null || month === undefined || dayOfMonth === null || dayOfMonth === undefined) return startDate;
            let targetYear = nextDate.getFullYear();
            let proposedDate;
            if (dayOfMonth === 'Last Day of Month') {
                proposedDate = setDate(setMonth(new Date(targetYear,0,1), month), getDaysInMonth(new Date(targetYear, month)));
            } else {
                proposedDate = new Date(targetYear, month, parseInt(dayOfMonth,10));
            }
            if (proposedDate < nextDate) {
                targetYear++;
                 if (dayOfMonth === 'Last Day of Month') {
                    proposedDate = setDate(setMonth(new Date(targetYear,0,1), month), getDaysInMonth(new Date(targetYear, month)));
                } else {
                    proposedDate = new Date(targetYear, month, parseInt(dayOfMonth,10));
                }
            }
            return proposedDate;
        default: return startDate;
    }
};


function AddEditRecurringExpenseScreen({ route, navigation }) {
  const { recurringExpenseId } = route.params || {};
  const [isEditMode, setIsEditMode] = useState(!!recurringExpenseId);
  const [currentUserDetails, setCurrentUserDetails] = useState(null);

  // Basic Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(''); // Overall amount for non-itemized, or sum for itemized
  const [frequency, setFrequency] = useState('Monthly');
  const [startDate, setStartDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(getDay(new Date()));
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate()));
  const [month, setMonth] = useState(new Date().getMonth());
  const [endDate, setEndDate] = useState(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Split Details State
  const [expenseType, setExpenseType] = useState('personal_solo'); // 'personal_solo', 'personal_shared', 'group'
  const [splitPaidByUid, setSplitPaidByUid] = useState(''); // UID of payer for the expense
  const [splitSelectedGroupId, setSplitSelectedGroupId] = useState(''); // For 'group' type
  const [splitSelectedFriends, setSplitSelectedFriends] = useState([]); // Array of UIDs for 'personal_shared'
  const [currentSplitTypeForDetail, setCurrentSplitTypeForDetail] = useState('equal'); // 'equal', 'exact', 'itemized' (for group)
  const [currentMemberOwes, setCurrentMemberOwes] = useState({}); // { uid: amount }
  const [currentItemsForDetail, setCurrentItemsForDetail] = useState([]); // [{ id, itemName, itemAmount, assignedTo[] }]

  // Data for pickers & UI
  const [userGroupsList, setUserGroupsList] = useState([]);
  const [acceptedFriendsList, setAcceptedFriendsList] = useState([]);
  const [payerOptions, setPayerOptions] = useState([]); // [{label, value:uid}] for Payer Picker
  const [groupMembersForSplitting, setGroupMembersForSplitting] = useState([]); // [{uid, name}] for current group

  // Loading & Modal States
  const [loadingInitialData, setLoadingInitialData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFriendSelectorModalVisible, setIsFriendSelectorModalVisible] = useState(false);
  const [isItemMemberModalVisible, setIsItemMemberModalVisible] = useState(false);
  const [currentItemIndexForModal, setCurrentItemIndexForModal] = useState(null);
  const [tempSelectedMembersForItem, setTempSelectedMembersForItem] = useState([]);


  // Initial data loading (current user, groups, friends)
  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserDetails({ uid: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0] });
      setSplitPaidByUid(user.uid); // Default payer
    } else { navigation.navigate('Login'); return; }

    // Fetch groups
    const unsubGroups = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: user.uid, status: 'accepted', email: user.email })
      .onSnapshot(snap => setUserGroupsList(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }))),
                  err => console.error("Error fetching groups:", err));

    // Fetch friends
    const fsQuery = firebase.firestore().collection('friendships')
        .where('userUids', 'array-contains', user.uid)
        .where('status', '==', 'accepted');
    fsQuery.get().then(async snapshot => {
        const friends = []; const friendUids = [];
        snapshot.forEach(doc => {
            const data = doc.data(); const friendUid = data.userUids.find(uid => uid !== user.uid);
            if (friendUid) friendUids.push(friendUid);
        });
        if (friendUids.length > 0) {
            const names = await fetchUsernames(friendUids);
            friendUids.forEach(uid => friends.push({ uid, name: names[uid] || 'Friend' }));
        }
        setAcceptedFriendsList(friends);
    }).catch(err => console.error("Error fetching friends:", err));

    return () => unsubGroups();
  }, [navigation]);

  // Populate Payer Picker options based on context
  useEffect(() => {
    if (!currentUserDetails) return;
    let options = [{ label: `You (${currentUserDetails.name})`, value: currentUserDetails.uid }];
    if (expenseType === 'group' && groupMembersForSplitting.length > 0) {
      options = groupMembersForSplitting.map(m => ({ label: m.name, value: m.uid }));
      // If current user is not in group members (should not happen if payer must be member), default to first member
      if (!groupMembersForSplitting.find(m=>m.uid === splitPaidByUid) && options.length > 0) setSplitPaidByUid(options[0].value);
      else if (!groupMembersForSplitting.find(m=>m.uid === splitPaidByUid) && options.length === 0) setSplitPaidByUid('');


    } else if (expenseType === 'personal_shared' && splitSelectedFriends.length > 0) {
      const friendDetails = splitSelectedFriends.map(uid => {
        const friend = acceptedFriendsList.find(f => f.uid === uid);
        return { label: friend?.name || 'Friend', value: uid };
      });
      options = [...options, ...friendDetails];
       // If current payer is not in the new list of options, reset
      if (!options.find(opt => opt.value === splitPaidByUid)) setSplitPaidByUid(currentUserDetails.uid);
    } else { // personal_solo
        if(splitPaidByUid !== currentUserDetails.uid) setSplitPaidByUid(currentUserDetails.uid);
    }
    setPayerOptions(options);
  }, [expenseType, groupMembersForSplitting, splitSelectedFriends, currentUserDetails, acceptedFriendsList]);


  // Fetch group members when a group is selected for splitting
  useEffect(() => {
    if (expenseType === 'group' && splitSelectedGroupId) {
      setLoadingInitialData(true); // Use this for group member loading
      const groupRef = firebase.firestore().collection('groups').doc(splitSelectedGroupId);
      groupRef.get().then(async doc => {
        if (doc.exists) {
          const groupData = doc.data();
          const acceptedMembersRaw = groupData.members.filter(m => m.status === 'accepted');
          const memberUids = acceptedMembersRaw.map(m => m.uid);
          let membersWithNames = [];
          if (memberUids.length > 0) {
            const namesMap = await fetchUsernames(memberUids);
            membersWithNames = acceptedMembersRaw.map(m => ({ ...m, name: namesMap[m.uid] || m.email }));
          }
          setGroupMembersForSplitting(membersWithNames);
          // Set default payer for group if current user is not part of it or if payer is not set
          if (!memberUids.includes(splitPaidByUid) && memberUids.length > 0) {
            setSplitPaidByUid(memberUids[0]); // Default to first member
          } else if (!memberUids.includes(splitPaidByUid) && memberUids.length === 0){
             setSplitPaidByUid(''); // No members to select as payer
          }
        }
        setLoadingInitialData(false);
      }).catch(err => { console.error(err); setLoadingInitialData(false); });
    } else {
      setGroupMembersForSplitting([]);
    }
  }, [expenseType, splitSelectedGroupId]);


  // Load existing recurring expense in Edit Mode
  useEffect(() => {
    if (isEditMode && recurringExpenseId && currentUserDetails) { // Ensure currentUserDetails is available
      setLoadingInitialData(true);
      const unsub = firebase.firestore().collection('recurringExpenses').doc(recurringExpenseId)
        .onSnapshot(doc => {
          if (doc.exists) {
            const data = doc.data();
            setDescription(data.description);
            setAmount(String(data.amount));
            setFrequency(data.frequency);
            setStartDate(data.startDate.toDate());
            if (data.dayOfWeek !== null) setDayOfWeek(data.dayOfWeek);
            if (data.dayOfMonth) setDayOfMonth(String(data.dayOfMonth));
            if (data.month !== null) setMonth(data.month);
            if (data.endDate) setEndDate(data.endDate.toDate());
            setIsActive(data.isActive);

            // Populate splitDetails state
            const sd = data.splitDetails || {};
            setSplitPaidByUid(sd.paidByUid || currentUserDetails.uid);
            setCurrentSplitTypeForDetail(sd.splitType || 'equal'); // Default for group/shared

            if (sd.groupId) {
              setExpenseType('group');
              setSplitSelectedGroupId(sd.groupId);
            } else if (sd.involvedUsers && sd.involvedUsers.length > 1) {
              setExpenseType('personal_shared');
              setSplitSelectedFriends(sd.involvedUsers.filter(uid => uid !== currentUserDetails.uid));
            } else {
              setExpenseType('personal_solo');
            }

            if (sd.splitType === 'exact' && sd.memberOwes) setCurrentMemberOwes(sd.memberOwes);
            if (sd.splitType === 'itemized' && sd.items) setCurrentItemsForDetail(sd.items.map((item,idx)=> ({...item, id:idx.toString()}))); // Add temp IDs for UI

          } else { Alert.alert("Error", "Recurring expense not found."); navigation.goBack(); }
          setLoadingInitialData(false);
        }, error => { console.error(error); setLoadingInitialData(false); navigation.goBack(); });
      return unsub;
    } else {
      setLoadingInitialData(false); // Not in edit mode or no ID
    }
  }, [isEditMode, recurringExpenseId, navigation, currentUserDetails]);


  const handleSave = async () => { /* ... */
    // Validation based on new state variables
    if (!description.trim() || !amount.trim() || !frequency || !startDate || !splitPaidByUid) {
      Alert.alert("Validation Error", "Core fields (Description, Amount, Frequency, Start Date, Payer) are required."); return;
    }
    // ... other validations for frequency specific fields, endDate ...

    setSubmitting(true);
    const numericAmount = parseFloat(amount);
    let finalSplitDetails = {
        paidByUid: splitPaidByUid,
        expenseDescription: description.trim(), // Use main description for now
    };

    if (expenseType === 'personal_solo') {
        finalSplitDetails.splitType = 'personal_solo';
        finalSplitDetails.involvedUsers = [splitPaidByUid]; // Only payer involved
    } else if (expenseType === 'personal_shared') {
        if (splitSelectedFriends.length === 0) { Alert.alert("Validation Error", "Please select friends to share with."); setSubmitting(false); return; }
        const involvedUsers = Array.from(new Set([splitPaidByUid, ...splitSelectedFriends]));
        finalSplitDetails.involvedUsers = involvedUsers;
        finalSplitDetails.splitType = currentSplitTypeForDetail; // 'equal' or 'exact' for personal_shared
        if (currentSplitTypeForDetail === 'exact') {
            // Validate currentMemberOwes for these involvedUsers
            // For now, assume currentMemberOwes is correctly populated for these users
            finalSplitDetails.memberOwes = currentMemberOwes;
        } else { // Equal
            finalSplitDetails.amountPerMember = numericAmount / involvedUsers.length;
        }
    } else if (expenseType === 'group') {
        if (!splitSelectedGroupId) { Alert.alert("Validation Error", "Please select a group."); setSubmitting(false); return; }
        if (groupMembersForSplitting.length === 0) { Alert.alert("Error", "Selected group has no members for splitting."); setSubmitting(false); return; }

        finalSplitDetails.groupId = splitSelectedGroupId;
        finalSplitDetails.splitType = currentSplitTypeForDetail;
        const groupAcceptedMemberUids = groupMembersForSplitting.map(m => m.uid);

        if (currentSplitTypeForDetail === 'equal') {
            finalSplitDetails.involvedUids = groupAcceptedMemberUids;
            finalSplitDetails.amountPerMember = numericAmount / groupAcceptedMemberUids.length;
        } else if (currentSplitTypeForDetail === 'exact') {
             // Validate currentMemberOwes for groupMembersForSplitting
            finalSplitDetails.memberOwes = currentMemberOwes;
            finalSplitDetails.involvedUids = groupAcceptedMemberUids.filter(uid => (currentMemberOwes[uid] || 0) > 0);
        } else if (currentSplitTypeForDetail === 'itemized') {
            // Simplified: Save the intent to itemize. Actual items could be default or defined per generation.
            // For now, implies all items split equally among all group members.
            finalSplitDetails.items = []; // Placeholder, actual items not defined in template for this step
            finalSplitDetails.involvedUids = groupAcceptedMemberUids;
            // memberOwes would be calculated at generation time based on items for that instance.
        }
    }

    const firstDueDate = calculateNextDueDateLogic(new Date(startDate), frequency, dayOfWeek, dayOfMonth, month);
    const dataToSave = {
      userId: currentUserDetails.uid, description: description.trim(), amount: numericAmount, frequency,
      startDate: firebase.firestore.Timestamp.fromDate(new Date(startDate)),
      dayOfWeek: frequency === 'Weekly' ? dayOfWeek : null,
      dayOfMonth: (frequency === 'Monthly' || frequency === 'Yearly') ? dayOfMonth : null,
      month: frequency === 'Yearly' ? month : null,
      endDate: endDate ? firebase.firestore.Timestamp.fromDate(new Date(endDate)) : null,
      isActive, nextDueDate: firebase.firestore.Timestamp.fromDate(firstDueDate),
      splitDetails: finalSplitDetails, // The detailed object
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (!isEditMode) dataToSave.createdAt = firebase.firestore.FieldValue.serverTimestamp();

    try { /* ... (Firestore save/update logic as before) ... */
      if (isEditMode) {
        await firebase.firestore().collection('recurringExpenses').doc(recurringExpenseId).update(dataToSave);
        Alert.alert("Success", "Recurring expense updated.");
      } else {
        await firebase.firestore().collection('recurringExpenses').add(dataToSave);
        Alert.alert("Success", "Recurring expense created.");
      }
      navigation.goBack();
    } catch (e) { console.error(e); Alert.alert("Error", "Save failed.");}
    setSubmitting(false);
  };

  // --- UI Rendering Functions for Split Details ---
  const renderSplitDetailsConfig = () => {
    if (loadingInitialData || (expenseType === 'group' && !splitSelectedGroupId && groupMembersForSplitting.length === 0)) {
        // Show loader if still fetching initial data or group members for a selected group
        if (expenseType === 'group' && splitSelectedGroupId) return <ActivityIndicator color={COLORS.primary} style={{marginVertical:10}}/>;
    }

    const currentContextMembers = expenseType === 'group'
        ? groupMembersForSplitting
        : expenseType === 'personal_shared'
            ? [{uid: currentUserDetails.uid, name: `You (${currentUserDetails.name})`}, ...acceptedFriendsList.filter(f => splitSelectedFriends.includes(f.uid))]
            : [{uid: currentUserDetails.uid, name: `You (${currentUserDetails.name})`}];


    return (
      <View style={styles.splitConfigSection}>
        <Text style={styles.label}>Payer</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={splitPaidByUid} onValueChange={setSplitPaidByUid} enabled={!submitting && payerOptions.length > 0} style={styles.picker}>
            {payerOptions.map(opt => <Picker.Item key={opt.value} label={opt.label} value={opt.value} />)}
          </Picker>
        </View>

        {(expenseType === 'personal_shared' || expenseType === 'group') && (
          <>
            <Text style={styles.label}>Split Method</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={currentSplitTypeForDetail} onValueChange={setCurrentSplitTypeForDetail} enabled={!submitting} style={styles.picker}>
                <Picker.Item label="Split Equally" value="equal" />
                <Picker.Item label="Split by Exact Amounts" value="exact" />
                {expenseType === 'group' && <Picker.Item label="Split Itemized (Simplified)" value="itemized" />}
              </Picker>
            </View>
          </>
        )}

        {currentSplitTypeForDetail === 'exact' && (expenseType === 'group' || expenseType === 'personal_shared') && (
          <View>
            <Text style={styles.subHeader}>Enter Exact Amounts Owed by Each:</Text>
            {currentContextMembers.map(member => (
              <StyledTextInput
                key={member.uid}
                label={member.name}
                keyboardType="numeric"
                placeholder="0.00"
                value={currentMemberOwes[member.uid] !== undefined ? String(currentMemberOwes[member.uid]) : ''}
                onChangeText={val => setCurrentMemberOwes(prev => ({...prev, [member.uid]: val}))}
                disabled={submitting}
              />
            ))}
          </View>
        )}
        {/* Simplified Itemized for Group: No item input here, just marks the type */}
        {currentSplitTypeForDetail === 'itemized' && expenseType === 'group' && (
            <Text style={styles.infoText}>Itemized expenses will require item entry when each actual expense is generated (feature not fully implemented in template).</Text>
        )}
      </View>
    );
  };

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1)); days.push("Last Day of Month");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; // Shortened
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // Shortened

  if (loadingInitialData && isEditMode) {
      return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary}/></View>
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>{isEditMode ? "Edit Recurring Expense" : "Create Recurring Expense"}</Text>

      <StyledTextInput label="Description" placeholder="e.g., Monthly Rent" value={description} onChangeText={setDescription} disabled={submitting}/>
      <StyledTextInput label="Amount" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" disabled={submitting || (expenseType==='group' && currentSplitTypeForDetail==='itemized')}/>

      <Text style={styles.label}>Frequency</Text>
      <View style={styles.pickerContainer}><Picker selectedValue={frequency} onValueChange={setFrequency} enabled={!submitting} style={styles.picker}>
          <Picker.Item label="Daily" value="Daily" /><Picker.Item label="Weekly" value="Weekly" />
          <Picker.Item label="Monthly" value="Monthly" /><Picker.Item label="Yearly" value="Yearly" />
      </Picker></View>

      <Text style={styles.label}>Start Date</Text>
      <TouchableOpacity onPress={() => setShowStartDatePicker(true)} style={styles.dateDisplay} disabled={submitting}>
        <Text style={styles.dateText}>{format(startDate, 'MMM dd, yyyy')}</Text>
      </TouchableOpacity>
      {showStartDatePicker && <DateTimePicker value={startDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(e,d) => {setShowStartDatePicker(false); if(d)setStartDate(d);}}/>}

      {/* ... (Conditional Frequency Pickers for dayOfWeek, dayOfMonth, month - keep existing structure) ... */}
        {frequency === 'Weekly' && (<View><Text style={styles.label}>Day of Week</Text><View style={styles.pickerContainer}><Picker selectedValue={dayOfWeek} onValueChange={setDayOfWeek} enabled={!submitting}>{weekDays.map((d,i)=><Picker.Item key={i} label={d} value={i}/>)}</Picker></View></View>)}
        {(frequency === 'Monthly' || frequency === 'Yearly') && (<View><Text style={styles.label}>Day of Month</Text><View style={styles.pickerContainer}><Picker selectedValue={dayOfMonth} onValueChange={setDayOfMonth} enabled={!submitting}>{days.map(d=><Picker.Item key={d} label={d} value={d}/>)}</Picker></View></View>)}
        {frequency === 'Yearly' && (<View><Text style={styles.label}>Month</Text><View style={styles.pickerContainer}><Picker selectedValue={month} onValueChange={setMonth} enabled={!submitting}>{monthNames.map((m,i)=><Picker.Item key={i} label={m} value={i}/>)}</Picker></View></View>)}

      <Text style={styles.label}>End Date (Optional)</Text>
      <TouchableOpacity onPress={() => setShowEndDatePicker(true)} style={styles.dateDisplay} disabled={submitting}>
        <Text style={styles.dateText}>{endDate ? format(endDate, 'MMM dd, yyyy') : "Tap to select"}</Text>
      </TouchableOpacity>
      {showEndDatePicker && <DateTimePicker value={endDate || startDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={startDate} onChange={(e,d)=>{setShowEndDatePicker(false); if(d)setEndDate(d);}}/>}
      {endDate && <StyledButton title="Clear End Date" onPress={()=>setEndDate(null)} type="secondary" style={styles.clearButton} textStyle={styles.clearButtonText}/>}

      <View style={styles.switchContainer}><Text style={styles.label}>Active</Text><Switch value={isActive} onValueChange={setIsActive} disabled={submitting} trackColor={{false: COLORS.disabled, true: COLORS.primary}} thumbColor={COLORS.cardBackground}/></View>

      <View style={styles.divider} />
      <Text style={styles.sectionHeader}>Expense Splitting Details</Text>

      <Text style={styles.label}>Expense Type</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={expenseType} onValueChange={val => { setExpenseType(val); setCurrentSplitTypeForDetail('equal'); setSplitSelectedGroupId(''); setSplitSelectedFriends([]); setCurrentMemberOwes({}); if (val==='personal_solo' && currentUserDetails) setSplitPaidByUid(currentUserDetails.uid);}} enabled={!submitting} style={styles.picker}>
          <Picker.Item label="Personal (Not Shared)" value="personal_solo" />
          <Picker.Item label="Personal (Share with Friends)" value="personal_shared" />
          <Picker.Item label="Group Expense" value="group" />
        </Picker>
      </View>

      {expenseType === 'group' && (
        <View>
          <Text style={styles.label}>Select Group</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={splitSelectedGroupId} onValueChange={val => {setSplitSelectedGroupId(val); setCurrentSplitTypeForDetail('equal'); setCurrentMemberOwes({});}} enabled={!submitting && userGroupsList.length > 0} style={styles.picker}>
              <Picker.Item label="Select a group..." value="" />
              {userGroupsList.map(g => <Picker.Item key={g.id} label={g.name} value={g.id} />)}
            </Picker>
          </View>
        </View>
      )}

      {expenseType === 'personal_shared' && (
        <View>
          <StyledButton title={splitSelectedFriends.length > 0 ? `Selected Friends (${splitSelectedFriends.length})` : "Select Friends to Share With"} onPress={() => setIsFriendSelectorModalVisible(true)} type="outline" style={{marginBottom:15}} disabled={submitting || acceptedFriendsList.length === 0}/>
           {acceptedFriendsList.length === 0 && !loadingInitialData && <Text style={styles.infoText}>No friends to share with. Add friends in the Friends screen.</Text>}
        </View>
      )}

      {/* Render Payer, Split Method, and Exact Amounts based on expenseType */}
      {(expenseType !== 'personal_solo' && (expenseType === 'group' ? splitSelectedGroupId : splitSelectedFriends.length > 0)) && renderSplitDetailsConfig()}


      <StyledButton title={submitting ? "Saving..." : (isEditMode ? "Update Recurring Expense" : "Create Recurring Expense")} onPress={handleSave} type="primary" disabled={submitting || loadingInitialData} style={{marginTop:25, width:'100%'}}/>

      {/* Friend Selector Modal (for personal_shared) */}
      <Modal visible={isFriendSelectorModalVisible} onRequestClose={() => setIsFriendSelectorModalVisible(false)} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Share with Friends</Text>
          <ScrollView>
          {acceptedFriendsList.map(friend => (
            <TouchableOpacity key={friend.uid} style={styles.memberSelectItem} onPress={() => {
                const newSelection = splitSelectedFriends.includes(friend.uid) ? splitSelectedFriends.filter(uid => uid !== friend.uid) : [...splitSelectedFriends, friend.uid];
                setSplitSelectedFriends(newSelection);
            }}>
              <Text style={styles.memberNameModal}>{friend.name}</Text>
              <RadioButton value={friend.uid} status={splitSelectedFriends.includes(friend.uid) ? 'checked' : 'unchecked'} />
            </TouchableOpacity>))}
          </ScrollView>
          <StyledButton title="Done" onPress={() => setIsFriendSelectorModalVisible(false)} type="primary" style={{marginTop:15}}/>
        </View></View>
      </Modal>

      {/* Item Member Assignment Modal (for group itemized) - Placeholder for now as item UI is not built */}
      {/* <Modal visible={isItemMemberModalVisible} ... /> */}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ... (Existing styles merged with new ones for clarity)
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContentContainer: { padding: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 25 },
  label: { fontSize: 16, marginBottom: 8, color: COLORS.textSecondary, fontWeight: '500' },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  picker: { height: 50 },
  dateDisplay: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 15, paddingHorizontal: 12, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  dateText: { fontSize: 16, color: COLORS.text },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingVertical:10, paddingHorizontal:15, backgroundColor:COLORS.cardBackground, borderRadius:8, borderWidth:1, borderColor:COLORS.border, marginBottom:20 },
  clearButton: {alignSelf:'flex-start', marginTop:-10, marginBottom:10, paddingVertical:5, paddingHorizontal:10},
  clearButtonText: {fontSize:13, color: COLORS.textSecondary},
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  sectionHeader: { fontSize: 20, fontWeight: '600', color: COLORS.text, marginBottom: 15, borderBottomWidth:1, borderBottomColor:COLORS.subtleBorder, paddingBottom:10 },
  splitConfigSection: { marginVertical: 10, padding:15, backgroundColor:COLORS.subtleBackground, borderRadius:8, borderWidth:1, borderColor:COLORS.border},
  subHeader: { fontSize: 16, fontWeight:'500', color: COLORS.text, marginTop:10, marginBottom:10},
  infoText: { textAlign: 'center', marginVertical: 10, color: COLORS.textSecondary, fontSize: 14 },
  // Modal Styles
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: COLORS.cardBackground, padding: 25, borderRadius: 10, width: '90%', maxHeight: '85%', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: COLORS.text },
  memberSelectItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.subtleBorder },
  memberNameModal: {fontSize: 16, color:COLORS.text},
  // Re-add exact amount input styles if they were separate
   exactAmountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingVertical:5, borderBottomWidth:1, borderBottomColor: COLORS.subtleBorder},
  memberNameLabel: { fontSize: 15, color: COLORS.text, flex: 0.6 },
  exactAmountInput: { flex: 0.4, textAlign: 'right', height:40, paddingVertical:5 },
});

export default AddEditRecurringExpenseScreen;
