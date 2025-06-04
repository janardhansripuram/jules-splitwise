import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, Button } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils'; // Import fetchUsernames

function GroupDetailScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;

  const [groupExpenses, setGroupExpenses] = useState([]);
  const [groupSettlements, setGroupSettlements] = useState([]);
  const [groupDetails, setGroupDetails] = useState(null);
  const [usernamesMap, setUsernamesMap] = useState({}); // For UID -> username mapping
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState({ netBalance: 0, settled: true });
  const [currentUserUid, setCurrentUserUid] = useState(null);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login');
      return; // Important to return if no user
    }
    navigation.setOptions({ title: groupName });
  }, [navigation, groupName]); // Removed currentUserUid from deps as it's set once


  // Helper function to calculate user's share in an expense
  const calculateMyShare = useCallback((expense, cUid) => {
    if (!expense.involvedUids || !expense.involvedUids.includes(cUid)) return 0;
    if (expense.splitType === 'equal') {
      return expense.amountPerMember || (expense.involvedUids.length > 0 ? expense.amount / expense.involvedUids.length : 0);
    } else if (expense.splitType === 'exact') {
      return expense.memberOwes && expense.memberOwes[cUid] ? expense.memberOwes[cUid] : 0;
    }
    return 0;
  }, []);

  // Recalculate balances whenever expenses or settlements change
  useEffect(() => {
    if (!currentUserUid || !groupExpenses || !groupSettlements) return; // Wait for all data

    let netBalance = 0;
    groupExpenses.forEach(expense => {
      const myShare = calculateMyShare(expense, currentUserUid);
      if (expense.paidByUid === currentUserUid) {
        netBalance += (expense.amount - myShare);
      } else {
        netBalance -= myShare;
      }
    });

    groupSettlements.forEach(settlement => {
      if (settlement.payerUid === currentUserUid) {
        netBalance -= settlement.amount;
      } else if (settlement.receiverUid === currentUserUid) {
        netBalance += settlement.amount;
      }
    });
    setBalances({ netBalance: finalNetBalance, settled: Math.abs(finalNetBalance) < 0.01 });
    setBalances({ netBalance: netBalance, settled: Math.abs(netBalance) < 0.01 });
  }, [groupExpenses, groupSettlements, currentUserUid, calculateMyShare]);


  // Fetch all data & usernames
  useEffect(() => {
    if (!currentUserUid || !groupId) return;

    setLoading(true);
    let activeListeners = 0;
    const doneLoadingPart = () => {
        activeListeners--;
        if (activeListeners === 0) setLoading(false);
    };

    const uidsToFetch = new Set();

    const processDataAndCollectUids = () => {
      if (groupDetails && groupDetails.members) {
        groupDetails.members.forEach(member => uidsToFetch.add(member.uid));
      }
      groupExpenses.forEach(expense => {
        uidsToFetch.add(expense.paidByUid);
        if (expense.involvedUids) expense.involvedUids.forEach(uid => uidsToFetch.add(uid));
        if (expense.memberOwes) Object.keys(expense.memberOwes).forEach(uid => uidsToFetch.add(uid));
      });
      groupSettlements.forEach(settlement => {
        uidsToFetch.add(settlement.payerUid);
        uidsToFetch.add(settlement.receiverUid);
      });

      if (uidsToFetch.size > 0) {
        fetchUsernames(Array.from(uidsToFetch)).then(setUsernamesMap);
      }
    };

    // Setup listeners
    activeListeners = 3;

    const unsubscribeExpenses = firebase.firestore().collection('expenses')
      .where('groupId', '==', groupId).orderBy('createdAt', 'desc')
      .onSnapshot(snap => { setGroupExpenses(snap.docs.map(d => ({id: d.id, ...d.data()}))); doneLoadingPart(); },
                   err => { console.error(err); doneLoadingPart(); });

    const unsubscribeGroupDetails = firebase.firestore().collection('groups').doc(groupId)
      .onSnapshot(snap => { setGroupDetails(snap.data()); doneLoadingPart(); },
                   err => { console.error(err); doneLoadingPart(); });

    const unsubscribeSettlements = firebase.firestore().collection('settlements')
      .where('groupId', '==', groupId).orderBy('createdAt', 'desc')
      .onSnapshot(snap => { setGroupSettlements(snap.docs.map(d => ({id: d.id, ...d.data()}))); doneLoadingPart(); },
                   err => { console.error(err); doneLoadingPart(); });

    return () => { unsubscribeExpenses(); unsubscribeGroupDetails(); unsubscribeSettlements(); };
  }, [groupId, currentUserUid]);

  // Effect for processing UIDs after data fetch
  useEffect(() => {
    processDataAndCollectUids();
  }, [groupDetails, groupExpenses, groupSettlements]); // Re-run if any of these data sets change


  const renderExpenseItem = ({ item }) => {
    if (!currentUserUid) return null;
    let splitDetail = '';
    if (item.splitType === 'equal') {
      const numMembers = item.involvedUids ? item.involvedUids.length : 0;
      const amtPerMember = (item.amountPerMember || 0).toFixed(2);
      splitDetail = `Split equally among ${numMembers} (${amtPerMember} each)`;
    } else if (item.splitType === 'exact') {
      const myShare = item.memberOwes && item.memberOwes[currentUserUid] ? item.memberOwes[currentUserUid].toFixed(2) : '0.00';
      if (item.paidByUid === currentUserUid) {
        splitDetail = `You paid. Your share: $${myShare}. Others' shares vary.`;
      } else {
        splitDetail = `They paid. Your share: $${myShare}. Others' shares vary.`;
      }
    }
    return (
      <View style={styles.expenseItem}>
        <View style={styles.expenseHeader}>
          <Text style={styles.expenseDescription}>{item.description}</Text>
          <Text style={styles.expenseAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
        </View>
        <Text style={styles.expensePaidBy}>Paid by: {usernamesMap[item.paidByUid] || item.paidByUid.substring(0,6)}</Text>
        <Text style={styles.expenseSplit}>{splitDetail}</Text>
         <Text style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</Text>
      </View>
    );
  };

  const renderSettlementItem = ({ item }) => (
    <View style={styles.settlementItem}>
      <Text style={styles.settlementText}>
        <Text style={styles.userName}>{usernamesMap[item.payerUid] || item.payerUid.substring(0,6)}</Text>
        {' paid '}
        <Text style={styles.userName}>{usernamesMap[item.receiverUid] || item.receiverUid.substring(0,6)}</Text>
        <Text style={styles.settlementAmount}> ${item.amount.toFixed(2)}</Text>
      </Text>
      {item.note ? <Text style={styles.settlementNote}>Note: {item.note}</Text> : null}
      <Text style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</Text>
    </View>
  );

  const renderBalanceSummary = () => {
    let balanceText = "You are settled up in this group.";
    let balanceStyle = styles.settledText;

    if (!balances.settled) {
      if (balances.netBalance > 0) {
        balanceText = `Overall, you are owed: $${balances.netBalance.toFixed(2)}`;
        balanceStyle = styles.owedToMeText;
      } else {
        balanceText = `Overall, you owe: $${Math.abs(balances.netBalance).toFixed(2)}`;
        balanceStyle = styles.youOweText;
      }
    }
    return <Text style={[styles.balanceSummaryText, balanceStyle]}>{balanceText}</Text>;
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#007bff" /><Text>Loading group details...</Text></View>;
  }

  const combinedActivity = [...groupExpenses, ...groupSettlements]
    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));

  const renderActivityItem = ({ item }) => {
    if (item.type === 'settlement') { // Assuming settlements have a 'type' field
      return renderSettlementItem({ item });
    }
    return renderExpenseItem({ item });
  };

  return (
    <View style={styles.container}>
      <View style={styles.balanceContainer}>{renderBalanceSummary()}</View>

      <View style={styles.actionButtonsContainer}>
        <Button title="Invite Member" onPress={() => navigation.navigate('InviteMembers', { groupId: groupId })} />
        <Button title="Record Payment" onPress={() => navigation.navigate('RecordPayment', { groupId: groupId })} />
      </View>

      <View style={styles.membersContainer}>
        <Text style={styles.sectionTitle}>Accepted Members:</Text>
        {groupDetails && groupDetails.members && groupDetails.members.filter(m => m.status === 'accepted').map((member, index) => (
          <Text key={member.uid || index} style={styles.memberEmail}>
            {usernamesMap[member.uid] || member.email} {member.uid === currentUserUid ? "(You)" : ""}
          </Text>
        ))}
        {(!groupDetails || !groupDetails.members || groupDetails.members.filter(m => m.status === 'accepted').length === 0) &&
            <Text style={styles.noMembersText}>No accepted members yet.</Text>}
      </View>

      <Text style={styles.sectionTitle}>Group Activity:</Text>
      {combinedActivity.length === 0 ? (
        <Text style={styles.noActivityText}>No activity in this group yet.</Text>
      ) : (
        <FlatList
          data={combinedActivity}
          renderItem={renderActivityItem}
          keyExtractor={item => item.id + (item.type || 'expense')}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: '#f9f9f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  balanceContainer: { padding: 15, backgroundColor: '#fff', borderRadius: 8, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  membersContainer: { padding: 15, backgroundColor: '#fff', borderRadius: 8, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#333' },
  memberEmail: { fontSize: 15, color: '#555', paddingVertical: 3 },
  noMembersText: { fontSize: 15, color: 'gray', fontStyle: 'italic' },
  balanceSummaryText: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  settledText: { color: 'green' },
  owedToMeText: { color: 'green' },
  youOweText: { color: 'red' },
  list: { marginTop: 5 },
  expenseItem: { backgroundColor: '#fff', padding: 15, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  expenseDescription: { fontSize: 16, fontWeight: '500', color: '#444' },
  expenseAmount: { fontSize: 16, fontWeight: 'bold', color: '#007bff' },
  expensePaidBy: { fontSize: 13, color: 'gray', marginBottom: 3 },
  expenseSplit: { fontSize: 13, color: 'dimgray' },
  noActivityText: { textAlign: 'center', marginTop: 20, fontSize: 16, color: 'gray' },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 },
  settlementItem: { backgroundColor: '#e8f5e9', padding: 15, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: '#c8e6c9' },
  settlementText: { fontSize: 16, color: '#2e7d32' },
  userName: { fontWeight: 'bold' },
  settlementAmount: { fontWeight: 'bold', color: '#1b5e20' },
  settlementNote: { fontSize: 14, color: '#555', marginTop: 4, fontStyle: 'italic' },
  itemDate: { fontSize: 12, color: 'gray', textAlign: 'right', marginTop: 5 },
});

export default GroupDetailScreen;
