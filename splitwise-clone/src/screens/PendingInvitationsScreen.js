import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { firebase } from '../../firebaseConfig';

function PendingInvitationsScreen({ navigation }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUser(user);
    } else {
      Alert.alert("Error", "No user logged in.");
      navigation.goBack();
      return;
    }

    const unsubscribe = firebase.firestore().collection('groups')
      .where('members', 'array-contains', { uid: user.uid, status: 'pending' })
      .onSnapshot(querySnapshot => {
        const fetchedInvitations = [];
        querySnapshot.forEach(doc => {
          fetchedInvitations.push({ id: doc.id, ...doc.data() });
        });
        setInvitations(fetchedInvitations);
        setLoading(false);
      }, error => {
        console.error("Error fetching pending invitations: ", error);
        Alert.alert("Error", "Could not fetch your pending invitations.");
        setLoading(false);
      });

    return () => unsubscribe();
  }, [navigation]);

  const handleAcceptInvitation = async (groupId) => {
    setLoading(true);
    const groupRef = firebase.firestore().collection('groups').doc(groupId);
    try {
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) throw new Error("Group not found");

      const groupData = groupDoc.data();
      const updatedMembers = groupData.members.map(member => {
        if (member.uid === currentUser.uid && member.status === 'pending') {
          return { ...member, status: 'accepted' };
        }
        return member;
      });

      await groupRef.update({ members: updatedMembers });
      Alert.alert("Invitation Accepted", `You have successfully joined the group: ${groupData.name}`);
      // List will refresh due to onSnapshot
    } catch (error) {
      console.error("Error accepting invitation: ", error);
      Alert.alert("Error", "Failed to accept invitation. " + error.message);
    }
    setLoading(false);
  };

  const handleDeclineInvitation = async (groupId) => {
    setLoading(true);
    const groupRef = firebase.firestore().collection('groups').doc(groupId);
    try {
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) throw new Error("Group not found");

      const groupData = groupDoc.data();
      // Option 1: Remove the member object
      const updatedMembers = groupData.members.filter(member => !(member.uid === currentUser.uid && member.status === 'pending'));
      // Option 2: Update status to 'declined' (if you want to keep a record)
      // const updatedMembers = groupData.members.map(member => {
      //   if (member.uid === currentUser.uid && member.status === 'pending') {
      //     return { ...member, status: 'declined' };
      //   }
      //   return member;
      // });

      await groupRef.update({ members: updatedMembers });
      Alert.alert("Invitation Declined", `You have declined to join the group: ${groupData.name}`);
    } catch (error) {
      console.error("Error declining invitation: ", error);
      Alert.alert("Error", "Failed to decline invitation. " + error.message);
    }
    setLoading(false);
  };

  if (loading && invitations.length === 0) { // Show full screen loader only on initial load
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text>Loading invitations...</Text>
      </View>
    );
  }

  if (invitations.length === 0 && !loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noInvitationsText}>You have no pending group invitations.</Text>
      </View>
    );
  }

  const renderItem = ({ item: group }) => (
    <View style={styles.invitationItem}>
      <Text style={styles.groupName}>{group.name}</Text>
      <Text style={styles.invitedBy}>Invited by (Creator): User {group.createdBy ? group.createdBy.substring(0,6) : 'N/A'}...</Text>
      <View style={styles.buttonContainer}>
        <Button title="Accept" onPress={() => handleAcceptInvitation(group.id)} color="green" disabled={loading} />
        <Button title="Decline" onPress={() => handleDeclineInvitation(group.id)} color="red" disabled={loading} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading && <ActivityIndicator style={styles.inlineLoader} size="small" color="#007bff" />}
      <FlatList
        data={invitations}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListHeaderComponent={<Text style={styles.title}>Your Group Invitations</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 15,
  },
  invitationItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '500',
  },
  invitedBy: {
    fontSize: 14,
    color: 'gray',
    marginVertical: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  noInvitationsText: {
    fontSize: 16,
    color: 'gray',
  },
  inlineLoader: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
  }
});

export default PendingInvitationsScreen;
