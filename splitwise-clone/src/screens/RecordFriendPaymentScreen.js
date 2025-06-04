import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledTextInput from '../components/StyledTextInput';
import StyledButton from '../components/StyledButton';
import { Picker } from '@react-native-picker/picker'; // Or RadioButton

const COLORS = {
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#212529',
  textSecondary: '#6c757d',
  primary: '#007bff',
  border: '#ced4da',
};

function RecordFriendPaymentScreen({ route, navigation }) {
  const { friendUid, friendName } = route.params;
  const [currentUserUid, setCurrentUserUid] = useState(null);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState('i_paid'); // 'i_paid' or 'friend_paid_me'
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      Alert.alert("Error", "User not authenticated.");
      navigation.goBack();
    }
    navigation.setOptions({ title: `Settle with ${friendName}` });
  }, [navigation, friendName]);

  const handleRecordPayment = async () => {
    if (!amount.trim() || !direction) {
      Alert.alert("Validation Error", "Please enter an amount and select payment direction.");
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }
    if (!currentUserUid || !friendUid) {
        Alert.alert("Error", "User or friend information is missing.");
        return;
    }

    setSubmitting(true);

    let payerUid, receiverUid;
    if (direction === 'i_paid') {
      payerUid = currentUserUid;
      receiverUid = friendUid;
    } else { // friend_paid_me
      payerUid = friendUid;
      receiverUid = currentUserUid;
    }

    try {
      const settlementData = {
        groupId: null, // Explicitly null for non-group settlements
        payerUid: payerUid,
        receiverUid: receiverUid,
        amount: numericAmount,
        note: note.trim(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        type: 'settlement',
      };
      await firebase.firestore().collection('settlements').add(settlementData);
      Alert.alert("Payment Recorded", "The payment has been successfully recorded.");
      setAmount('');
      setNote('');
      // navigation.goBack(); // Or navigate to a specific place, FriendsScreen might auto-refresh
      // To ensure FriendsScreen refreshes, consider passing a refresh param or using focus listener there
      navigation.navigate('Friends', { refresh: true });


    } catch (error) {
      console.error("Error recording friend payment: ", error);
      Alert.alert("Error", "Could not record payment. " + error.message);
    }
    setSubmitting(false);
  };

  if (!currentUserUid) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary}/></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Recording Payment with</Text>
      <Text style={styles.friendNameText}>{friendName}</Text>

      <StyledTextInput
        label="Amount"
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        disabled={submitting}
        style={{marginTop: 20}}
      />

      <Text style={styles.label}>Payment Direction:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={direction}
          onValueChange={(itemValue) => setDirection(itemValue)}
          enabled={!submitting}
          style={styles.picker}
        >
          <Picker.Item label={`I paid ${friendName}`} value="i_paid" />
          <Picker.Item label={`${friendName} paid me`} value="friend_paid_me" />
        </Picker>
      </View>

      <StyledTextInput
        label="Note (Optional)"
        placeholder="e.g., For dinner last night"
        value={note}
        onChangeText={setNote}
        disabled={submitting}
        multiline
        numberOfLines={3}
      />

      <StyledButton
        title={submitting ? "Recording..." : "Record Payment"}
        onPress={handleRecordPayment}
        type="primary"
        disabled={submitting}
        style={{marginTop: 20}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: COLORS.background
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background
  },
  headerText: {
    fontSize: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  friendNameText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 25,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: COLORS.textSecondary,
    fontWeight: '500'
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: COLORS.cardBackground
  },
  picker: {
    height: 50,
  },
});

export default RecordFriendPaymentScreen;
