import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledTextInput from '../components/StyledTextInput';
import StyledButton from '../components/StyledButton';
import { fetchUsernames } from '../utils/userUtils'; // Assuming this utility exists and works

const COLORS = {
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#212529',
  textSecondary: '#6c757d',
  primary: '#007bff',
  success: '#28a745',
  danger: '#dc3545',
  warning: '#ffc107',
  border: '#dee2e6',
  subtleText: '#adb5bd',
};

function FriendsScreen({ navigation }) {
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  // Add Friend Tab State
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null); // { uid, name, email, status: 'already_friends' | 'request_pending' | 'can_request' | 'is_self' }
  const [isSearching, setIsSearching] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Friend Requests Tab State
  const [friendRequests, setFriendRequests] = useState([]); // { id (friendshipDocId), requestedByUid, requestedByName }
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // My Friends Tab State
  const [myFriends, setMyFriends] = useState([]); // { id (friendshipDocId), friendUid, friendName }
  const [friendBalances, setFriendBalances] = useState({}); // { friendUid: balance }
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingFriendBalances, setIsLoadingFriendBalances] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
      setCurrentUserEmail(user.email);
    } else {
      navigation.navigate('Login'); // Should not happen if AuthLoadingScreen is working
    }
  }, [navigation]);

  const fetchData = useCallback(async () => {
    if (!currentUserUid) return;
    setRefreshing(true);
    setIsLoadingRequests(true);
    setIsLoadingFriends(true);
      setIsLoadingFriendBalances(true);
    setFriendBalances({});

    try {
      // Fetch Friend Requests (logic remains same)
      const requestsQuery = firebase.firestore().collection('friendships').where('userUids', 'array-contains', currentUserUid).where('status', '==', 'pending');
      const requestsSnapshot = await requestsQuery.get();
      const incomingRequests = []; const requestUserUids = new Set();
      requestsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.requestedByUid !== currentUserUid) { incomingRequests.push({ id: doc.id, ...data }); requestUserUids.add(data.requestedByUid); }
      });
      let requestUsernames = {}; if (requestUserUids.size > 0) requestUsernames = await fetchUsernames(Array.from(requestUserUids));
      setFriendRequests(incomingRequests.map(req => ({...req, requestedByName: requestUsernames[req.requestedByUid] || 'Unknown User' })));
      setIsLoadingRequests(false);

      // Fetch My Friends
      const friendsQuery = firebase.firestore().collection('friendships').where('userUids', 'array-contains', currentUserUid).where('status', '==', 'accepted');
      const friendsSnapshot = await friendsQuery.get();
      const acceptedFriends = []; const friendUids = new Set();
      friendsSnapshot.forEach(doc => {
        const data = doc.data(); const friendUid = data.userUids.find(uid => uid !== currentUserUid);
        if (friendUid) { acceptedFriends.push({ id: doc.id, friendUid, ...data }); friendUids.add(friendUid); }
      });
      let friendUsernames = {}; if (friendUids.size > 0) friendUsernames = await fetchUsernames(Array.from(friendUids));
      const friendsWithName = acceptedFriends.map(f => ({...f, friendName: friendUsernames[f.friendUid] || 'Unknown User' }));
      setMyFriends(friendsWithName);
      setIsLoadingFriends(false);

      // After fetching friends, calculate their direct balances
      if (friendsWithName.length > 0) {
        const balances = {};

        // Fetch all non-group expenses involving the current user once
        const personalExpensesSnapshot = await firebase.firestore().collection('expenses')
            .where('groupId', '==', null)
            .where('involvedUids', 'array-contains', currentUserUid)
            .get();
        const personalExpenses = personalExpensesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

        // Fetch all non-group settlements involving the current user once
        // This requires two queries or more complex client-side filtering if not careful
        const settlementsPaidByMeSnapshot = await firebase.firestore().collection('settlements')
            .where('groupId', '==', null)
            .where('payerUid', '==', currentUserUid)
            .get();
        const settlementsReceivedByMeSnapshot = await firebase.firestore().collection('settlements')
            .where('groupId', '==', null)
            .where('receiverUid', '==', currentUserUid)
            .get();

        const directSettlements = [
            ...settlementsPaidByMeSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})),
            ...settlementsReceivedByMeSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}))
        ];
        // Filter unique settlements (in case a settlement somehow got fetched twice, though unlikely with this query structure)
        const uniqueDirectSettlements = Array.from(new Map(directSettlements.map(s => [s.id, s])).values());


        for (const friend of friendsWithName) {
          let netBalanceWithFriend = 0;

          // Calculate from expenses
          const expensesWithThisFriend = personalExpenses.filter(expense =>
            expense.involvedUids.includes(friend.friendUid)
          );
          expensesWithThisFriend.forEach(expense => {
            const currentUserShare = calculateUserShareInExpense(expense, currentUserUid);
            const friendShare = calculateUserShareInExpense(expense, friend.friendUid);
            if (expense.paidByUid === currentUserUid) {
              netBalanceWithFriend += friendShare;
            } else if (expense.paidByUid === friend.friendUid) {
              netBalanceWithFriend -= currentUserShare;
            }
          });

          // Calculate from direct settlements
          const settlementsWithThisFriend = uniqueDirectSettlements.filter(settlement =>
            (settlement.payerUid === friend.friendUid && settlement.receiverUid === currentUserUid) ||
            (settlement.payerUid === currentUserUid && settlement.receiverUid === friend.friendUid)
          );
          settlementsWithThisFriend.forEach(settlement => {
            if (settlement.payerUid === currentUserUid) { // I paid the friend
              netBalanceWithFriend -= settlement.amount;
            } else { // Friend paid me
              netBalanceWithFriend += settlement.amount;
            }
          });
          balances[friend.friendUid] = netBalanceWithFriend;
        }
        setFriendBalances(balances);
      }
      setIsLoadingFriendBalances(false);

    } catch (error) {
      console.error("Error fetching friends data or balances:", error);
      Alert.alert("Error", "Could not load all data.");
      setIsLoadingRequests(false);
      setIsLoadingFriends(false);
      setIsLoadingFriendBalances(false);
    }
    setRefreshing(false);
  }, [currentUserUid]);

// Helper function (could be moved to balanceUtils.js if used elsewhere)
const calculateUserShareInExpense = (expense, userId) => {
    if (!userId || !expense.involvedUids || !expense.involvedUids.includes(userId)) {
        return 0;
    }
    if (expense.splitType === 'equal') {
        return expense.amountPerMember || (expense.involvedUids.length > 0 ? expense.amount / expense.involvedUids.length : 0);
    } else if (expense.splitType === 'exact' || expense.splitType === 'itemized') {
        return expense.memberOwes?.[userId] || 0;
    }
    return 0;
};

  useEffect(() => {
    if (currentUserUid) {
      fetchData();
    }
  }, [currentUserUid, fetchData]);

  const onRefresh = () => fetchData();

  // --- Add Friend Logic ---
  const handleSearchEmail = async () => {
    if (!searchEmail.trim() || !currentUserEmail) return;
    const targetEmail = searchEmail.trim().toLowerCase();

    if (targetEmail === currentUserEmail) {
      setSearchResult({ status: 'is_self', email: targetEmail });
      return;
    }

    setIsSearching(true);
    setSearchResult(null);
    try {
      const usersRef = firebase.firestore().collection('users');
      const querySnapshot = await usersRef.where('email', '==', targetEmail).limit(1).get();

      if (querySnapshot.empty) {
        Alert.alert("Not Found", "No user found with this email address.");
        setSearchResult(null);
      } else {
        const targetUserDoc = querySnapshot.docs[0];
        const targetUserData = { uid: targetUserDoc.id, name: targetUserDoc.data().name, email: targetUserDoc.data().email };

        // Check existing friendship status
        const friendshipId = [currentUserUid, targetUserData.uid].sort().join('_');
        const friendshipDoc = await firebase.firestore().collection('friendships').doc(friendshipId).get();

        if (friendshipDoc.exists) {
          const status = friendshipDoc.data().status;
          if (status === 'accepted') {
            setSearchResult({ ...targetUserData, status: 'already_friends' });
          } else if (status === 'pending') {
            setSearchResult({ ...targetUserData, status: 'request_pending' });
          } else { // declined, blocked - can allow new request for simplicity for now
            setSearchResult({ ...targetUserData, status: 'can_request' });
          }
        } else {
          setSearchResult({ ...targetUserData, status: 'can_request' });
        }
      }
    } catch (error) {
      console.error("Error searching user:", error);
      Alert.alert("Search Error", "An error occurred while searching.");
      setSearchResult(null);
    }
    setIsSearching(false);
  };

  const handleSendFriendRequest = async (targetUserUid) => {
    if (!currentUserUid || !targetUserUid) return;
    setIsSendingRequest(true);
    const friendshipId = [currentUserUid, targetUserUid].sort().join('_');
    try {
      await firebase.firestore().collection('friendships').doc(friendshipId).set({
        userUids: [currentUserUid, targetUserUid],
        status: 'pending',
        requestedByUid: currentUserUid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert("Request Sent", "Friend request sent successfully.");
      setSearchResult(prev => prev ? {...prev, status: 'request_pending'} : null); // Update UI
    } catch (error) {
      console.error("Error sending friend request:", error);
      Alert.alert("Error", "Could not send friend request.");
    }
    setIsSendingRequest(false);
  };

  // --- Friend Requests Logic ---
  const handleUpdateRequestStatus = async (friendshipId, newStatus) => {
    try {
      await firebase.firestore().collection('friendships').doc(friendshipId).update({
        status: newStatus,
        respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert("Success", `Request ${newStatus}.`);
      fetchData(); // Refresh lists
    } catch (error) {
      console.error(`Error updating request to ${newStatus}:`, error);
      Alert.alert("Error", `Could not ${newStatus} request.`);
    }
  };

  // --- Render Sections ---
  const renderAddFriend = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>Add Friend</Text>
      <StyledTextInput
        placeholder="Enter friend's email"
        value={searchEmail}
        onChangeText={setSearchEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <StyledButton title={isSearching ? "Searching..." : "Search"} onPress={handleSearchEmail} type="primary" disabled={isSearching} />
      {searchResult && (
        <View style={styles.searchResultCard}>
          <Text style={styles.searchResultName}>{searchResult.name || searchResult.email}</Text>
          {searchResult.status === 'can_request' &&
            <StyledButton title={isSendingRequest ? "Sending..." : "Send Request"} onPress={() => handleSendFriendRequest(searchResult.uid)} type="success" disabled={isSendingRequest} />}
          {searchResult.status === 'already_friends' && <Text style={styles.infoText}>You are already friends.</Text>}
          {searchResult.status === 'request_pending' && <Text style={styles.infoText}>Friend request pending.</Text>}
          {searchResult.status === 'is_self' && <Text style={styles.infoText}>You cannot add yourself as a friend.</Text>}
        </View>
      )}
    </View>
  );

  const renderFriendRequests = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>Friend Requests</Text>
      {isLoadingRequests ? <ActivityIndicator color={COLORS.primary} /> :
        friendRequests.length === 0 ? <Text style={styles.noItemsText}>No pending friend requests.</Text> :
        friendRequests.map(req => (
          <View key={req.id} style={styles.listItemCard}>
            <Text style={styles.listItemText}>{req.requestedByName}</Text>
            <View style={styles.actionButtons}>
              <StyledButton title="Accept" onPress={() => handleUpdateRequestStatus(req.id, 'accepted')} type="success" style={styles.smallButton} textStyle={styles.smallButtonText}/>
              <StyledButton title="Decline" onPress={() => handleUpdateRequestStatus(req.id, 'declined')} type="danger" style={styles.smallButton} textStyle={styles.smallButtonText}/>
            </View>
          </View>
        ))
      }
    </View>
  );

  const renderMyFriends = () => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>My Friends</Text>
      {isLoadingFriends || isLoadingFriendBalances ? <ActivityIndicator color={COLORS.primary} style={{marginTop: 10}}/> :
        myFriends.length === 0 ? <Text style={styles.noItemsText}>You have no friends yet. Add some!</Text> :
        myFriends.map(friend => {
          const balance = friendBalances[friend.friendUid] || 0;
          let balanceText = "Settled up (Direct)";
          let balanceColor = COLORS.subtleText;
          if (balance > 0.01) {
            balanceText = `Owes you: $${balance.toFixed(2)}`;
            balanceColor = COLORS.success;
          } else if (balance < -0.01) {
            balanceText = `You owe: $${Math.abs(balance).toFixed(2)}`;
            balanceColor = COLORS.danger;
          }
          return (
            <View key={friend.id} style={styles.listItemCard}>
              <View style={styles.friendInfo}>
                <Text style={styles.listItemText}>{friend.friendName}</Text>
                <Text style={{...styles.balanceText, color: balanceColor}}>{balanceText}</Text>
              </View>
              <StyledButton
                title="Settle"
                onPress={() => navigation.navigate('RecordFriendPayment', { friendUid: friend.friendUid, friendName: friend.friendName })}
                type="secondary" // Or a different type for settle buttons
                style={styles.settleButton}
                textStyle={styles.settleButtonText}
              />
            </View>
          );
        })
      }
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]}/>}
    >
      <Text style={styles.screenHeader}>Manage Friends</Text>
      {renderAddFriend()}
      {renderFriendRequests()}
      {renderMyFriends()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screenHeader: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    paddingVertical: 20,
  },
  sectionContainer: {
    marginHorizontal: 15,
    marginBottom: 25,
    padding: 15,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 15,
  },
  searchResultCard: {
    marginTop: 15,
    padding: 15,
    backgroundColor: COLORS.background, // Slightly different bg for search result
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  searchResultName: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  listItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.subtleBorder,
  },
  friendInfo: {
    flex: 1, // Allow text to take up available space
    marginRight: 10, // Space before button
  },
  listItemText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  balanceText: {
    fontSize: 13,
    marginTop: 3,
  },
  settleButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 'auto', // Let text define width
  },
  settleButtonText: {
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  smallButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 8,
    minWidth: 70,
  },
  smallButtonText: {
    fontSize: 14,
  },
  noItemsText: {
    textAlign: 'center',
    marginVertical: 15,
    fontSize: 15,
    color: COLORS.textSecondary,
  },
});

export default FriendsScreen;
