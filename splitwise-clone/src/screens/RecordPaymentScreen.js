import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Picker } from '@react-native-picker/picker';
import { fetchUsernames } from '../utils/userUtils'; // Import fetchUsernames

function RecordPaymentScreen({ route, navigation }) {
  const { groupId } = route.params;

  const [groupMembers, setGroupMembers] = useState([]); // Stores {uid, name (fetched)}
  const [payerUid, setPayerUid] = useState(null);
  const [receiverUid, setReceiverUid] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // No need for usernamesMap state here if we embed names directly into groupMembers state

  useEffect(() => {
    navigation.setOptions({ title: "Record Payment" });
    const groupRef = firebase.firestore().collection('groups').doc(groupId);

    groupRef.get().then(async (doc) => { // Make async to use await for fetchUsernames
      if (doc.exists) {
        const groupData = doc.data();
        const acceptedMembersRaw = groupData.members.filter(m => m.status === 'accepted');
        const memberUids = acceptedMembersRaw.map(m => m.uid);

        if (memberUids.length > 0) {
          const namesMap = await fetchUsernames(memberUids);
          const membersWithNames = acceptedMembersRaw.map(m => ({
            uid: m.uid,
            // Use fetched name, fallback to email, then to a generic placeholder
            name: namesMap[m.uid] || m.email || `User ${m.uid.substring(0,6)}`,
          }));
          setGroupMembers(membersWithNames);

          const currentUser = firebase.auth().currentUser;
          if (currentUser && membersWithNames.some(m => m.uid === currentUser.uid)) {
            setPayerUid(currentUser.uid);
          } else if (membersWithNames.length > 0) {
            setPayerUid(membersWithNames[0].uid);
          }
        } else {
          setGroupMembers([]); // No accepted members
        }
      } else {
        Alert.alert("Error", "Group details not found.");
        navigation.goBack();
      }
      setLoading(false);
    }).catch(error => {
      console.error("Error fetching group members: ", error);
      Alert.alert("Error", "Could not fetch group members.");
      setLoading(false);
      navigation.goBack();
    });
  }, [groupId, navigation]);

  const handleRecordPayment = async () => {
    if (!payerUid || !receiverUid || !amount.trim()) {
      Alert.alert("Validation Error", "Please select payer, receiver, and enter an amount.");
      return;
    }
    if (payerUid === receiverUid) {
      Alert.alert("Validation Error", "Payer and receiver cannot be the same person.");
      return;
    }
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Validation Error", "Amount must be a positive number.");
      return;
    }
    setSubmitting(true);
    try {
      const settlementData = {
        groupId: groupId,
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
      //setPayerUid(groupMembers.length > 0 ? groupMembers[0].uid : null); // Reset or keep current user as default
      //setReceiverUid(null);
      navigation.goBack();
    } catch (error) {
      console.error("Error recording payment: ", error);
      Alert.alert("Error", "Could not record payment. " + error.message);
    }
    setSubmitting(false);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /><Text>Loading members...</Text></View>;
  }

  // Filter out the selected payer from the receiver list
  const availableReceivers = groupMembers.filter(member => member.uid !== payerUid);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Who paid?</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={payerUid} onValueChange={(itemValue) => setPayerUid(itemValue)} style={styles.picker} enabled={!submitting && groupMembers.length > 0}>
          {groupMembers.map(member => (<Picker.Item key={member.uid} label={member.name} value={member.uid} />))}
        </Picker>
      </View>

      <Text style={styles.label}>To whom?</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={receiverUid} onValueChange={(itemValue) => setReceiverUid(itemValue)} style={styles.picker} enabled={availableReceivers.length > 0 && !submitting}>
          <Picker.Item label="Select receiver..." value={null} />
          {availableReceivers.map(member => (<Picker.Item key={member.uid} label={member.name} value={member.uid} />))}
        </Picker>
      </View>

      <Text style={styles.label}>Amount:</Text>
      <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" editable={!submitting} />

      <Text style={styles.label}>Note (Optional):</Text>
      <TextInput style={styles.input} placeholder="e.g., Settled for dinner" value={note} onChangeText={setNote} editable={!submitting} />

      {submitting ? (
        <ActivityIndicator size="large" color="#007bff" />
      ) : (
        <Button title="Record Payment" onPress={handleRecordPayment} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center'},
  label: { fontSize: 16, marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 20, borderRadius: 8, backgroundColor: '#f9f9f9', fontSize: 16 },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginBottom: 20, backgroundColor: '#f9f9f9' },
  picker: { height: 50 },
});

export default RecordPaymentScreen;
