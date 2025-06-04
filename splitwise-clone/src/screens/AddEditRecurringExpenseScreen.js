import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Platform, Switch } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledTextInput from '../components/StyledTextInput';
import StyledButton from '../components/StyledButton';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO, getDay, getDaysInMonth, setDate, setMonth, addMonths, addWeeks, addYears, addDays, isLastDayOfMonth as dfnsIsLastDayOfMonth } from 'date-fns';

const COLORS = { /* Simplified palette */
  background: '#f8f9fa', text: '#212529', primary: '#007bff', border: '#ced4da',
  textSecondary: '#6c757d', danger: '#dc3545', cardBackground: '#ffffff',
  disabled: '#e9ecef',
};

// Helper for calculating next due date
const calculateNextDueDateLogic = (startDate, frequency, dayOfWeek, dayOfMonth, month) => {
    let nextDate = new Date(startDate); // Ensure it's a Date object
    nextDate.setHours(12,0,0,0); // Normalize time to avoid DST issues

    switch (frequency) {
        case 'Daily':
            // If start date is in past, first due is today, else it's startDate
            return nextDate < new Date() ? new Date() : nextDate;
        case 'Weekly':
            if (dayOfWeek === null || dayOfWeek === undefined) return startDate; // Should not happen if validated
            const currentDay = getDay(nextDate); // Sunday is 0, Saturday is 6
            let daysToAdd = dayOfWeek - currentDay;
            if (daysToAdd < 0) daysToAdd += 7; // Ensure it's upcoming or today
            nextDate = addDays(nextDate, daysToAdd);
            return nextDate;
        case 'Monthly':
            if (dayOfMonth === null || dayOfMonth === undefined) return startDate;
            if (dayOfMonth === 'Last Day of Month') {
                nextDate = setDate(nextDate, getDaysInMonth(nextDate));
            } else {
                const targetDay = parseInt(dayOfMonth, 10);
                if (getDate(nextDate) > targetDay) nextDate = addMonths(nextDate, 1); // Move to next month if current day already passed
                nextDate = setDate(nextDate, targetDay);
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
            if (proposedDate < nextDate) { // If this year's date has passed
                targetYear++; // Move to next year
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
  const [currentUserUid, setCurrentUserUid] = useState(null);

  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('Monthly'); // Default
  const [startDate, setStartDate] = useState(new Date());
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

  // Conditional frequency fields
  const [dayOfWeek, setDayOfWeek] = useState(getDay(new Date())); // Sunday=0, ..., Default to current day of week
  const [dayOfMonth, setDayOfMonth] = useState(String(new Date().getDate())); // Default to current day of month
  const [month, setMonth] = useState(new Date().getMonth()); // January=0, ..., Default to current month

  const [endDate, setEndDate] = useState(null); // Optional
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) setCurrentUserUid(user.uid);
    else navigation.navigate('Login');

    if (isEditMode && recurringExpenseId) {
      setSubmitting(true); // Use submitting as general loading for edit mode fetch
      const unsub = firebase.firestore().collection('recurringExpenses').doc(recurringExpenseId)
        .onSnapshot(doc => {
          if (doc.exists) {
            const data = doc.data();
            setDescription(data.description);
            setAmount(String(data.amount));
            setFrequency(data.frequency);
            setStartDate(data.startDate.toDate()); // Convert Firestore Timestamp to Date
            if (data.dayOfWeek !== null && data.dayOfWeek !== undefined) setDayOfWeek(data.dayOfWeek);
            if (data.dayOfMonth) setDayOfMonth(String(data.dayOfMonth)); // Ensure string for picker
            if (data.month !== null && data.month !== undefined) setMonth(data.month);
            if (data.endDate) setEndDate(data.endDate.toDate());
            setIsActive(data.isActive);
          } else {
            Alert.alert("Error", "Recurring expense not found.");
            navigation.goBack();
          }
          setSubmitting(false);
        }, error => {
            console.error("Error fetching recurring expense:", error);
            Alert.alert("Error", "Could not load expense data.");
            setSubmitting(false);
            navigation.goBack();
        });
      return unsub;
    }
  }, [isEditMode, recurringExpenseId, navigation]);

  const handleSave = async () => {
    if (!description.trim() || !amount.trim() || !frequency || !startDate) {
      Alert.alert("Validation Error", "Description, amount, frequency, and start date are required.");
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }
    if ((frequency === 'Weekly' && (dayOfWeek === null || dayOfWeek === undefined)) ||
        (frequency === 'Monthly' && !dayOfMonth) ||
        (frequency === 'Yearly' && (month === null || month === undefined || !dayOfMonth))) {
      Alert.alert("Validation Error", "Please select all required date parts for the chosen frequency.");
      return;
    }
     if (endDate && startDate > endDate) {
      Alert.alert("Validation Error", "End date cannot be before the start date.");
      return;
    }

    setSubmitting(true);

    const firstDueDate = calculateNextDueDateLogic(new Date(startDate), frequency, dayOfWeek, dayOfMonth, month);

    const dataToSave = {
      userId: currentUserUid,
      description: description.trim(),
      amount: numericAmount,
      frequency,
      startDate: firebase.firestore.Timestamp.fromDate(new Date(startDate)), // Store as Timestamp
      dayOfWeek: frequency === 'Weekly' ? dayOfWeek : null,
      dayOfMonth: (frequency === 'Monthly' || frequency === 'Yearly') ? dayOfMonth : null,
      month: frequency === 'Yearly' ? month : null,
      endDate: endDate ? firebase.firestore.Timestamp.fromDate(new Date(endDate)) : null,
      isActive,
      nextDueDate: firebase.firestore.Timestamp.fromDate(firstDueDate),
      // Placeholder for splitDetails - to be implemented in a future step
      splitDetails: {
        splitType: 'personal_solo', // Defaulting to personal for now
        paidByUid: currentUserUid,
        expenseDescription: description.trim(),
        // For group expenses, this would include groupId, involvedUids, etc.
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (!isEditMode) dataToSave.createdAt = firebase.firestore.FieldValue.serverTimestamp();


    try {
      if (isEditMode) {
        await firebase.firestore().collection('recurringExpenses').doc(recurringExpenseId).update(dataToSave);
        Alert.alert("Success", "Recurring expense updated.");
      } else {
        await firebase.firestore().collection('recurringExpenses').add(dataToSave);
        Alert.alert("Success", "Recurring expense created.");
      }
      navigation.goBack();
    } catch (error) {
      console.error("Error saving recurring expense:", error);
      Alert.alert("Error", "Could not save recurring expense. " + error.message);
    }
    setSubmitting(false);
  };

  const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
  days.push("Last Day of Month");
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContentContainer} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>{isEditMode ? "Edit Recurring Expense" : "Create Recurring Expense"}</Text>

      <StyledTextInput label="Description" placeholder="e.g., Monthly Rent, Netflix Subscription" value={description} onChangeText={setDescription} disabled={submitting}/>
      <StyledTextInput label="Amount" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" disabled={submitting}/>

      <Text style={styles.label}>Frequency</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={frequency} onValueChange={setFrequency} enabled={!submitting} style={styles.picker}>
          <Picker.Item label="Daily" value="Daily" />
          <Picker.Item label="Weekly" value="Weekly" />
          <Picker.Item label="Monthly" value="Monthly" />
          <Picker.Item label="Yearly" value="Yearly" />
        </Picker>
      </View>

      <Text style={styles.label}>Start Date</Text>
      <TouchableOpacity onPress={() => setShowStartDatePicker(true)} style={styles.dateDisplay} disabled={submitting}>
        <Text style={styles.dateText}>{format(startDate, 'MMM dd, yyyy')}</Text>
      </TouchableOpacity>
      {showStartDatePicker && (
        <DateTimePicker value={startDate} mode="date" display="default" onChange={(event, selectedDate) => { setShowStartDatePicker(false); if(selectedDate) setStartDate(selectedDate);}}/>
      )}

      {frequency === 'Weekly' && (
        <>
          <Text style={styles.label}>Day of the Week</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={dayOfWeek} onValueChange={setDayOfWeek} enabled={!submitting} style={styles.picker}>
              {weekDays.map((day, index) => <Picker.Item key={index} label={day} value={index} />)}
            </Picker>
          </View>
        </>
      )}
      {(frequency === 'Monthly' || frequency === 'Yearly') && (
        <>
          <Text style={styles.label}>Day of the Month</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={dayOfMonth} onValueChange={setDayOfMonth} enabled={!submitting} style={styles.picker}>
              {days.map(day => <Picker.Item key={day} label={day} value={day} />)}
            </Picker>
          </View>
        </>
      )}
      {frequency === 'Yearly' && (
        <>
          <Text style={styles.label}>Month</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={month} onValueChange={setMonth} enabled={!submitting} style={styles.picker}>
              {monthNames.map((m, index) => <Picker.Item key={index} label={m} value={index} />)}
            </Picker>
          </View>
        </>
      )}

      <Text style={styles.label}>End Date (Optional)</Text>
      <TouchableOpacity onPress={() => setShowEndDatePicker(true)} style={styles.dateDisplay} disabled={submitting}>
        <Text style={styles.dateText}>{endDate ? format(endDate, 'MMM dd, yyyy') : "Tap to select"}</Text>
      </TouchableOpacity>
      {showEndDatePicker && (
        <DateTimePicker value={endDate || startDate} mode="date" display="default" minimumDate={startDate}
                        onChange={(event, selectedDate) => { setShowEndDatePicker(false); if(selectedDate) setEndDate(selectedDate);}}/>
      )}
      {endDate && <StyledButton title="Clear End Date" onPress={()=>setEndDate(null)} type="secondary" style={{alignSelf:'flex-start', marginTop:-10, marginBottom:10}} textStyle={{fontSize:13}}/>}


      <View style={styles.switchContainer}>
        <Text style={styles.label}>Active</Text>
        <Switch value={isActive} onValueChange={setIsActive} disabled={submitting} trackColor={{ false: COLORS.disabled, true: COLORS.primary }} thumbColor={COLORS.cardBackground} />
      </View>

      <StyledButton title={submitting ? "Saving..." : (isEditMode ? "Update Expense" : "Create Expense")} onPress={handleSave} type="primary" disabled={submitting} style={{marginTop:25, width:'100%'}}/>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContentContainer: { padding: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.text, textAlign: 'center', marginBottom: 25 },
  label: { fontSize: 16, marginBottom: 8, color: COLORS.textSecondary, fontWeight: '500' },
  pickerContainer: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  picker: { height: 50 },
  dateDisplay: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 15, paddingHorizontal: 12, marginBottom: 20, backgroundColor: COLORS.cardBackground },
  dateText: { fontSize: 16, color: COLORS.text },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingVertical:10, paddingHorizontal:5, backgroundColor:COLORS.cardBackground, borderRadius:8, borderWidth:1, borderColor:COLORS.border },
});

export default AddEditRecurringExpenseScreen;
