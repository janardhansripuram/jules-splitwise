import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';

function GroupsListScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login'); // Or handle appropriately
      return;
    }
    const currentUserUid = currentUser.uid;

    const unsubscribe = firebase.firestore().collection('groups')
      .where('members', 'array-contains', currentUserUid)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const groupsArray = [];
        querySnapshot.forEach(documentSnapshot => {
          groupsArray.push({
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          });
        });
        setGroups(groupsArray);
        setLoading(false);
      }, error => {
        console.error("Error fetching groups: ", error);
        Alert.alert("Error", "Could not fetch groups.");
        setLoading(false);
      });

    return () => unsubscribe(); // Unsubscribe on unmount
  }, [navigation]);

  const renderGroupItem = ({ item }) => (
    <TouchableOpacity
      style={styles.groupItem}
      onPress={() => navigation.navigate('GroupDetail', { groupId: item.id, groupName: item.name })}
    >
      <Text style={styles.groupName}>{item.name}</Text>
      <Text style={styles.groupMemberCount}>{item.members ? item.members.length : 0} members</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Loading groups...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Button
        title="Create New Group"
        onPress={() => navigation.navigate('CreateGroup')}
      />
      {groups.length === 0 ? (
        <Text style={styles.noGroupsText}>No groups yet. Create one!</Text>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroupItem}
          keyExtractor={item => item.id}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    marginTop: 20,
  },
  groupItem: {
    paddingVertical: 15,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  groupName: {
    fontSize: 18,
    fontWeight: '500',
  },
  groupMemberCount: {
    fontSize: 14,
    color: 'gray',
  },
  noGroupsText: {
    textAlign: 'center',
    marginTop: 30,
    fontSize: 18,
    color: 'gray',
  },
});

export default GroupsListScreen;
