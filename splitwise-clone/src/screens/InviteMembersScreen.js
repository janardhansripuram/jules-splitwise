import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';

function InviteMembersScreen({ route, navigation }) {
  const { groupId } = route.params;
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendInvitation = async () => {
    if (!inviteeEmail.trim()) {
      Alert.alert("Input Error", "Please enter an email address to invite.");
      return;
    }
    setLoading(true);
    const normalizedEmail = inviteeEmail.trim().toLowerCase();

    try {
      const groupRef = firebase.firestore().collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();

      if (!groupDoc.exists) {
        Alert.alert("Error", "Group not found.");
        setLoading(false);
        return;
      }

      const groupData = groupDoc.data();
      const currentMembers = groupData.members || [];

      // Check if email is already a member or invited
      const existingMember = currentMembers.find(member => member.email === normalizedEmail);
      if (existingMember) {
        if (existingMember.status === 'accepted') {
          Alert.alert("Already Member", "This user is already a member of the group.");
        } else if (existingMember.status === 'pending' || existingMember.status === 'pending_signup') {
          Alert.alert("Already Invited", "This user has already been invited to the group.");
        }
        setLoading(false);
        return;
      }

      // Check if user exists in 'users' collection
      const usersRef = firebase.firestore().collection('users');
      const userQuerySnapshot = await usersRef.where('email', '==', normalizedEmail).limit(1).get();

      let newMemberData;
      if (!userQuerySnapshot.empty) {
        // User exists
        const existingUserDoc = userQuerySnapshot.docs[0];
        const existingUserUid = existingUserDoc.id;
        newMemberData = { uid: existingUserUid, email: normalizedEmail, status: 'pending' };
      } else {
        // User does not exist, invite by email for them to sign up
        newMemberData = { email: normalizedEmail, status: 'pending_signup' };
      }

      // Add to group members array
      await groupRef.update({
        members: firebase.firestore.FieldValue.arrayUnion(newMemberData)
      });

      Alert.alert("Invitation Sent", `Invitation sent to ${normalizedEmail}.`);
      setInviteeEmail(''); // Clear input
    } catch (error) {
      console.error("Error sending invitation: ", error);
      Alert.alert("Error", "Could not send invitation. Please try again. " + error.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Invite Member</Text>
      <Text style={styles.label}>Enter email address of the person you want to invite to this group.</Text>
      <TextInput
        style={styles.input}
        placeholder="user@example.com"
        value={inviteeEmail}
        onChangeText={setInviteeEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      {loading ? (
        <ActivityIndicator size="large" color="#007bff" />
      ) : (
        <Button title="Send Invitation" onPress={handleSendInvitation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    fontSize: 16,
  },
});

export default InviteMembersScreen;
