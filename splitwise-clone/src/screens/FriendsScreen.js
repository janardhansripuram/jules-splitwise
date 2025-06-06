import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils';
import {
    Button as PaperButton,
    TextInput as PaperTextInput,
    Text as PaperText,
    useTheme,
    ActivityIndicator as PaperActivityIndicator,
    Card as PaperCard,
    Divider as PaperDivider,
    MD3Colors // For specific color fallbacks if needed
} from 'react-native-paper';

// Removed local COLORS, will use theme.colors

function FriendsScreen({ navigation }) {
  const theme = useTheme();
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const [friendRequests, setFriendRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  const [myFriends, setMyFriends] = useState([]);
  const [friendBalances, setFriendBalances] = useState({});
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingFriendBalances, setIsLoadingFriendBalances] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
      setCurrentUserEmail(user.email);
    } else {
      navigation.navigate('Login');
    }
  }, [navigation]);

  // Helper function (copied from previous version, should ideally be in balanceUtils if not already)
  const calculateUserShareInExpense = (expense, userId) => {
    if (!userId || !expense.involvedUids || !expense.involvedUids.includes(userId)) { return 0; }
    if (expense.splitType === 'equal') { return expense.amountPerMember || (expense.involvedUids.length > 0 ? expense.amount / expense.involvedUids.length : 0); }
    else if (expense.splitType === 'exact' || expense.splitType === 'itemized') { return expense.memberOwes?.[userId] || 0; }
    return 0;
  };

  const fetchData = useCallback(async () => {
    if (!currentUserUid) return;
    setRefreshing(true);
    setIsLoadingRequests(true);
    setIsLoadingFriends(true);
    setIsLoadingFriendBalances(true);
    setFriendBalances({});

    try {
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

      if (friendsWithName.length > 0) {
        const balances = {};
        const personalExpensesSnapshot = await firebase.firestore().collection('expenses').where('groupId', '==', null).where('involvedUids', 'array-contains', currentUserUid).get();
        const personalExpenses = personalExpensesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

        const settlementsPaidByMeSnapshot = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('payerUid', '==', currentUserUid).get();
        const settlementsReceivedByMeSnapshot = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('receiverUid', '==', currentUserUid).get();
        const directSettlements = [...settlementsPaidByMeSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})), ...settlementsReceivedByMeSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}))];
        const uniqueDirectSettlements = Array.from(new Map(directSettlements.map(s => [s.id, s])).values());

        for (const friend of friendsWithName) {
          let netBalanceWithFriend = 0;
          const expensesWithThisFriend = personalExpenses.filter(expense => expense.involvedUids.includes(friend.friendUid));
          expensesWithThisFriend.forEach(expense => {
            const currentUserShare = calculateUserShareInExpense(expense, currentUserUid);
            const friendShare = calculateUserShareInExpense(expense, friend.friendUid);
            if (expense.paidByUid === currentUserUid) netBalanceWithFriend += friendShare;
            else if (expense.paidByUid === friend.friendUid) netBalanceWithFriend -= currentUserShare;
          });
          const settlementsWithThisFriend = uniqueDirectSettlements.filter(s => (s.payerUid === friend.friendUid && s.receiverUid === currentUserUid) || (s.payerUid === currentUserUid && s.receiverUid === friend.friendUid));
          settlementsWithThisFriend.forEach(s => { if (s.payerUid === currentUserUid) netBalanceWithFriend -= s.amount; else netBalanceWithFriend += s.amount; });
          balances[friend.friendUid] = parseFloat(netBalanceWithFriend.toFixed(2));
        }
        setFriendBalances(balances);
      }
      setIsLoadingFriendBalances(false);
    } catch (error) {
      console.error("Error fetching friends data/balances:", error);
      Alert.alert("Error", "Could not load data.");
      setIsLoadingRequests(false); setIsLoadingFriends(false); setIsLoadingFriendBalances(false);
    }
    setRefreshing(false);
  }, [currentUserUid]);

  useEffect(() => { if (currentUserUid) fetchData(); }, [currentUserUid, fetchData]);
  const onRefresh = () => fetchData();

  const handleSearchEmail = async () => { /* ... (logic mostly same, ensure Alert is used) ... */
    if (!searchEmail.trim() || !currentUserEmail) return;
    const targetEmail = searchEmail.trim().toLowerCase();
    if (targetEmail === currentUserEmail) { setSearchResult({ status: 'is_self', email: targetEmail }); return; }
    setIsSearching(true); setSearchResult(null);
    try {
      const querySnapshot = await firebase.firestore().collection('users').where('email', '==', targetEmail).limit(1).get();
      if (querySnapshot.empty) { Alert.alert("Not Found", "No user with this email."); setSearchResult(null); }
      else {
        const targetUserDoc = querySnapshot.docs[0];
        const targetUserData = { uid: targetUserDoc.id, name: targetUserDoc.data().name, email: targetUserDoc.data().email };
        const friendshipId = [currentUserUid, targetUserData.uid].sort().join('_');
        const friendshipDoc = await firebase.firestore().collection('friendships').doc(friendshipId).get();
        if (friendshipDoc.exists) {
          const status = friendshipDoc.data().status;
          if (status === 'accepted') setSearchResult({ ...targetUserData, status: 'already_friends' });
          else if (status === 'pending') setSearchResult({ ...targetUserData, status: 'request_pending' });
          else setSearchResult({ ...targetUserData, status: 'can_request' });
        } else setSearchResult({ ...targetUserData, status: 'can_request' });
      }
    } catch (e) { console.error(e); Alert.alert("Search Error"); setSearchResult(null); }
    setIsSearching(false);
  };
  const handleSendFriendRequest = async (targetUserUid) => { /* ... (logic mostly same, ensure Alert is used) ... */
    setIsSendingRequest(true);
    const friendshipId = [currentUserUid, targetUserUid].sort().join('_');
    try {
      await firebase.firestore().collection('friendships').doc(friendshipId).set({
        userUids: [currentUserUid, targetUserUid], status: 'pending',
        requestedByUid: currentUserUid, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert("Request Sent"); setSearchResult(prev => prev ? {...prev, status: 'request_pending'} : null);
    } catch (e) { console.error(e); Alert.alert("Error Sending Request"); }
    setIsSendingRequest(false);
  };
  const handleUpdateRequestStatus = async (friendshipId, newStatus) => { /* ... (logic mostly same, ensure Alert is used) ... */
    try {
      await firebase.firestore().collection('friendships').doc(friendshipId).update({
        status: newStatus, respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Alert.alert("Success", `Request ${newStatus}.`); fetchData();
    } catch (e) { console.error(e); Alert.alert("Error Updating Request");}
  };

  const renderAddFriend = () => (
    <PaperCard style={styles.sectionCard} elevation={2}>
      <PaperCard.Title title="Add Friend" titleVariant="titleLarge" titleStyle={{color: theme.colors.primary}}/>
      <PaperCard.Content>
        <PaperTextInput
          label="Friend's Email"
          value={searchEmail}
          onChangeText={setSearchEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          mode="outlined"
          style={{marginBottom:10}}
          disabled={isSearching}
        />
        <PaperButton mode="contained" onPress={handleSearchEmail} loading={isSearching} disabled={isSearching}>
          Search
        </PaperButton>
        {searchResult && (
          <View style={styles.searchResultCard}>
            <PaperText variant="titleMedium" style={{color: theme.colors.onSurface}}>{searchResult.name || searchResult.email}</PaperText>
            {searchResult.status === 'can_request' &&
              <PaperButton mode="contained-tonal" onPress={() => handleSendFriendRequest(searchResult.uid)} loading={isSendingRequest} disabled={isSendingRequest} style={{marginTop:10}}>
                Send Request
              </PaperButton>}
            {searchResult.status === 'already_friends' && <PaperText style={styles.infoText}>You are already friends.</PaperText>}
            {searchResult.status === 'request_pending' && <PaperText style={styles.infoText}>Friend request pending.</PaperText>}
            {searchResult.status === 'is_self' && <PaperText style={styles.infoText}>This is you!</PaperText>}
          </View>
        )}
      </PaperCard.Content>
    </PaperCard>
  );

  const renderFriendRequests = () => (
    <PaperCard style={styles.sectionCard} elevation={2}>
      <PaperCard.Title title="Friend Requests" titleVariant="titleLarge" titleStyle={{color: theme.colors.primary}}/>
      <PaperCard.Content>
      {isLoadingRequests ? <PaperActivityIndicator animating={true} color={theme.colors.primary} /> :
        friendRequests.length === 0 ? <PaperText style={styles.noItemsText}>No pending friend requests.</PaperText> :
        friendRequests.map(req => (
          <View key={req.id} style={styles.listItemContainer}>
            <PaperText variant="bodyLarge" style={styles.listItemText}>{req.requestedByName}</PaperText>
            <View style={styles.actionButtons}>
              <PaperButton mode="contained" onPress={() => handleUpdateRequestStatus(req.id, 'accepted')} style={styles.smallButton} labelStyle={styles.smallButtonText} buttonColor={theme.colors.customSuccess || MD3Colors.green600}>Accept</PaperButton>
              <PaperButton mode="outlined" onPress={() => handleUpdateRequestStatus(req.id, 'declined')} style={styles.smallButton} labelStyle={styles.smallButtonText} textColor={theme.colors.error}>Decline</PaperButton>
            </View>
          </View>
        ))
      }
      </PaperCard.Content>
    </PaperCard>
  );

  const renderMyFriends = () => (
    <PaperCard style={styles.sectionCard} elevation={2}>
      <PaperCard.Title title="My Friends" titleVariant="titleLarge" titleStyle={{color: theme.colors.primary}}/>
      <PaperCard.Content>
      {isLoadingFriends || isLoadingFriendBalances ? <PaperActivityIndicator animating={true} color={theme.colors.primary} style={{marginTop: 10}}/> :
        myFriends.length === 0 ? <PaperText style={styles.noItemsText}>You have no friends yet.</PaperText> :
        myFriends.map(friend => {
          const balance = friendBalances[friend.friendUid] || 0;
          let balanceText = "Settled up (Direct)";
          let balanceTextStyle = {color: theme.colors.onSurfaceVariant, fontStyle: 'italic'};
          if (balance > 0.01) {
            balanceText = `Owes you: $${balance.toFixed(2)}`;
            balanceTextStyle = {color: theme.colors.customSuccess || MD3Colors.green600, fontWeight: 'bold'};
          } else if (balance < -0.01) {
            balanceText = `You owe: $${Math.abs(balance).toFixed(2)}`;
            balanceTextStyle = {color: theme.colors.error, fontWeight: 'bold'};
          }
          return (
            <View key={friend.id} style={styles.listItemContainer}>
              <View style={styles.friendInfo}>
                <PaperText variant="bodyLarge" style={styles.listItemTextMain}>{friend.friendName}</PaperText>
                <PaperText variant="bodySmall" style={[styles.balanceText, balanceTextStyle]}>{balanceText}</PaperText>
              </View>
              <PaperButton
                mode="outlined"
                onPress={() => navigation.navigate('RecordFriendPayment', { friendUid: friend.friendUid, friendName: friend.friendName })}
                style={styles.settleButton}
                labelStyle={styles.smallButtonText}
              >Settle</PaperButton>
            </View>
          );
        })
      }
      </PaperCard.Content>
    </PaperCard>
  );

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: theme.colors.background}]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
    >
      <PaperText variant="headlineMedium" style={[styles.screenHeader, {color: theme.colors.onBackground}]}>Manage Friends</PaperText>
      {renderAddFriend()}
      {renderFriendRequests()}
      {renderMyFriends()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, },
  screenHeader: { textAlign: 'center', paddingVertical: 20, },
  sectionCard: { marginHorizontal: 15, marginBottom: 25, },
  searchResultCard: { marginTop: 15, padding: 15, borderRadius: 8, borderWidth:1, alignItems: 'center', },
  infoText: { fontSize: 14, marginTop: 8, /* color from theme */ },
  listItemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, },
  friendInfo: { flex: 1, marginRight: 10, },
  listItemTextMain: { /* Use PaperText variant */ },
  listItemText: { /* Use PaperText variant */ },
  balanceText: { fontSize: 13, marginTop: 3, },
  settleButton: { paddingHorizontal: 2, }, // Reduced padding for "Settle"
  smallButton: { marginHorizontal: 4, }, // Applied to Accept/Decline
  smallButtonText: { fontSize: 13, marginHorizontal:0, marginVertical:0, paddingHorizontal:2}, // Compact text
  actionButtons: { flexDirection: 'row', },
  noItemsText: { textAlign: 'center', marginVertical: 15, fontSize: 15, },
});

export default FriendsScreen;
