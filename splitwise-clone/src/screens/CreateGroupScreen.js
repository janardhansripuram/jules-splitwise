import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { firebase } from '../../firebaseConfig';

function CreateGroupScreen({ navigation }) {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Input Error", "Group name is required.");
      return;
    }

    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Authentication Error", "No user logged in. Please login again.");
      // Potentially navigate to Login screen
      // navigation.navigate('Login');
      return;
    }
    const currentUserUid = currentUser.uid;
    const currentUserEmail = currentUser.email; // Get current user's email

    if (!currentUserEmail) {
      Alert.alert("Authentication Error", "Could not retrieve user email. Please ensure your profile is complete or try logging in again.");
      return;
    }

    try {
      const groupData = {
        name: groupName,
        description: groupDescription,
        createdBy: currentUserUid,
        members: [{
          uid: currentUserUid,
          email: currentUserEmail, // Store email
          status: 'accepted'
        }],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await firebase.firestore().collection('groups').add(groupData);

      console.log('Group created successfully with new member structure!');
      Alert.alert("Group Created", `Group "${groupName}" was successfully created.`);
      setGroupName('');
      setGroupDescription('');
      // Navigate to GroupsListScreen or back to Dashboard
      navigation.goBack(); // Or navigation.navigate('GroupsList');
    } catch (error) {
      console.error("Error creating group: ", error);
      Alert.alert("Error", "Could not create group. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create New Group</Text>
      <TextInput
        style={styles.input}
        placeholder="Group Name (Required)"
        value={groupName}
        onChangeText={setGroupName}
      />
      <TextInput
        style={styles.input}
        placeholder="Group Description (Optional)"
        value={groupDescription}
        onChangeText={setGroupDescription}
        multiline
      />
      <Button title="Create Group" onPress={handleCreateGroup} />
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
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
});

export default CreateGroupScreen;
