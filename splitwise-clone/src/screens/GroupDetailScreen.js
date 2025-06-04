import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils';
import StyledButton from '../components/StyledButton';
import { calculateNetBalance, calculateUserShareInExpense } from '../utils/balanceUtils'; // Import balance utils

const COLORS = {
  background: '#f8f9fa',
  cardBackground: '#ffffff',
  text: '#212529',
  textSecondary: '#6c757d',
  primary: '#007bff',
  accentPositive: '#28a745',
  accentNegative: '#dc3545',
  border: '#dee2e6',
  subtleBorder: '#e9ecef',
  expenseItemBg: '#ffffff',
  settlementItemBg: '#e6f7ff',
};

function GroupDetailScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;

  const [groupExpenses, setGroupExpenses] = useState([]);
  const [groupSettlements, setGroupSettlements] = useState([]);
  const [groupDetails, setGroupDetails] = useState(null);
  const [usernamesMap, setUsernamesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balances, setBalances] = useState({ netBalance: 0, settled: true });
  const [currentUserUid, setCurrentUserUid] = useState(null);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login');
    }
    navigation.setOptions({ title: groupName || 'Group Details' });
  }, [navigation, groupName]);

  const fetchData = useCallback(async () => {
    if (!currentUserUid || !groupId) return;
    setRefreshing(true);

    const uidsToFetch = new Set();
    try {
      const groupDoc = await firebase.firestore().collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        Alert.alert("Error", "Group not found.");
        navigation.goBack(); return;
      }
      const currentGroupDetails = groupDoc.data();
      setGroupDetails(currentGroupDetails);
      currentGroupDetails.members?.forEach(member => uidsToFetch.add(member.uid));

      const expensesSnapshot = await firebase.firestore().collection('expenses').where('groupId', '==', groupId).orderBy('createdAt', 'desc').get();
      const expensesArray = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGroupExpenses(expensesArray);
      expensesArray.forEach(exp => {
        uidsToFetch.add(exp.paidByUid);
        exp.involvedUids?.forEach(uid => uidsToFetch.add(uid));
        if(exp.memberOwes) Object.keys(exp.memberOwes).forEach(uid => uidsToFetch.add(uid));
      });

      const settlementsSnapshot = await firebase.firestore().collection('settlements').where('groupId', '==', groupId).orderBy('createdAt', 'desc').get();
      const settlementsArray = settlementsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGroupSettlements(settlementsArray);
      settlementsArray.forEach(sett => { uidsToFetch.add(sett.payerUid); uidsToFetch.add(sett.receiverUid); });

      if (uidsToFetch.size > 0) {
        const namesMap = await fetchUsernames(Array.from(uidsToFetch));
        setUsernamesMap(namesMap);
      }
    } catch (error) {
      console.error("Error fetching group data: ", error);
      Alert.alert("Error", "Could not fetch group data.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [groupId, currentUserUid, navigation]);

  useEffect(() => {
    if (currentUserUid && groupId) {
      fetchData();
    }
  }, [currentUserUid, groupId, fetchData]);

  useEffect(() => {
    if (!currentUserUid || loading || refreshing) return;

    const netBalanceForGroup = calculateNetBalance(groupExpenses, groupSettlements, currentUserUid);
    setBalances({ netBalance: netBalanceForGroup, settled: Math.abs(netBalanceForGroup) < 0.01 });
  }, [groupExpenses, groupSettlements, currentUserUid, loading, refreshing]);

  const renderExpenseItem = ({ item }) => {
    if (!currentUserUid) return null;
    let splitDetail = '';
    const myShareInExpense = calculateUserShareInExpense(item, currentUserUid);
    const payerName = usernamesMap[item.paidByUid] || `User ${item.paidByUid?.substring(0,6)}...`;

    if (item.splitType === 'equal') {
      splitDetail = `Split equally (${(item.amountPerMember || 0).toFixed(2)} each)`;
    } else if (item.splitType === 'exact') {
      splitDetail = `Your share: $${myShareInExpense.toFixed(2)}`;
    } else if (item.splitType === 'itemized') {
      splitDetail = `Itemized - Your total share: $${myShareInExpense.toFixed(2)}`;
    }

    return (
      <TouchableOpacity onPress={() => item.splitType === 'itemized' && navigation.navigate('ItemizedExpenseDetail', { expense: item, usernamesMap: usernamesMap })}>
        <View style={styles.expenseItem}>
          <View style={styles.expenseHeader}>
            <Text style={styles.expenseDescription}>{item.description}</Text>
            <Text style={styles.expenseAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
          </View>
          <Text style={styles.expensePaidBy}>Paid by: {item.paidByUid === currentUserUid ? "You" : payerName}</Text>
          <Text style={styles.expenseSplit}>{splitDetail}</Text>
          {item.splitType === 'itemized' && <Text style={styles.viewItemsText}>(Tap to view items)</Text>}
          <Text style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSettlementItem = ({ item }) => { /* ... (same as provided in failed diff) ... */
    const payerName = usernamesMap[item.payerUid] || `User ${item.payerUid?.substring(0,6)}...`;
    const receiverName = usernamesMap[item.receiverUid] || `User ${item.receiverUid?.substring(0,6)}...`;
    return (
    <View style={styles.settlementItem}>
      <Text style={styles.settlementText}>
        <Text style={styles.userName}>{item.payerUid === currentUserUid ? "You" : payerName}</Text>
        {' paid '}
        <Text style={styles.userName}>{item.receiverUid === currentUserUid ? "You" : receiverName}</Text>
        <Text style={styles.settlementAmount}> ${item.amount.toFixed(2)}</Text>
      </Text>
      {item.note ? <Text style={styles.settlementNote}>Note: {item.note}</Text> : null}
      <Text style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</Text>
    </View>
  )};

  const renderBalanceSummary = () => { /* ... (same as provided in failed diff) ... */
    let balanceText = "Calculating balance...";
    let balanceStyle = styles.balanceCalculatingText;

    if (!loading && !refreshing) {
        if (balances.settled) {
            balanceText = "You are settled up in this group!";
            balanceStyle = styles.settledText;
        } else if (balances.netBalance > 0) {
            balanceText = `Overall, you are owed: $${balances.netBalance.toFixed(2)}`;
            balanceStyle = styles.owedToMeText;
        } else {
            balanceText = `Overall, you owe: $${Math.abs(balances.netBalance).toFixed(2)}`;
            balanceStyle = styles.youOweText;
        }
    }
    return <Text style={[styles.balanceSummaryText, balanceStyle]}>{balanceText}</Text>;
  };

  if (loading && !refreshing) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /><Text>Loading group details...</Text></View>;
  }

  const combinedActivity = [...groupExpenses, ...groupSettlements]
    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));

  const renderActivityItem = ({ item }) => {
    if (item.type === 'settlement') {
      return renderSettlementItem({ item });
    }
    return renderExpenseItem({ item });
  };

  return (
    <View style={styles.container}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.balanceContainer}>{renderBalanceSummary()}</View>
            <View style={styles.actionButtonsContainer}>
              <StyledButton title="Invite Member" onPress={() => navigation.navigate('InviteMembers', { groupId: groupId })} type="secondary" style={styles.actionButton}/>
              <StyledButton title="Record Payment" onPress={() => navigation.navigate('RecordPayment', { groupId: groupId })} type="secondary" style={styles.actionButton}/>
            </View>
            <View style={styles.membersContainer}>
              <Text style={styles.sectionTitle}>Accepted Members</Text>
              {groupDetails && groupDetails.members && groupDetails.members.filter(m => m.status === 'accepted').length > 0 ? (
                groupDetails.members.filter(m => m.status === 'accepted').map(member => (
                  <Text key={member.uid} style={styles.memberEmail}>
                    {usernamesMap[member.uid] || member.email} {member.uid === currentUserUid ? "(You)" : ""}
                  </Text>
                ))
              ) : (
                <Text style={styles.noItemsText}>No other accepted members.</Text>
              )}
            </View>
            <Text style={styles.sectionTitle}>Group Activity</Text>
          </>
        }
        data={combinedActivity}
        renderItem={renderActivityItem}
        keyExtractor={item => item.id + (item.type || 'expense')}
        style={styles.activityList}
        ListEmptyComponent={<Text style={styles.noItemsText}>{loading || refreshing ? 'Loading activity...' : 'No activity in this group yet.'}</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} colors={[COLORS.primary]}/>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  balanceContainer: { padding: 20, backgroundColor: COLORS.cardBackground, margin:15, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2, }, shadowOpacity: 0.05, shadowRadius: 3.84, elevation: 3, alignItems: 'center' },
  balanceSummaryText: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  balanceCalculatingText: { color: COLORS.textSecondary },
  settledText: { color: COLORS.accentPositive },
  owedToMeText: { color: COLORS.accentPositive },
  youOweText: { color: COLORS.accentNegative },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20, paddingHorizontal:10 },
  actionButton: { flex: 0.48 },
  membersContainer: { padding: 15, backgroundColor: COLORS.cardBackground, marginHorizontal:15, marginBottom:20, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1, }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 12, paddingHorizontal: 20 },
  memberEmail: { fontSize: 15, color: COLORS.textSecondary, paddingVertical: 5, borderBottomWidth:1, borderBottomColor: COLORS.subtleBorder },
  activityList: { paddingHorizontal: 15 },
  expenseItem: { backgroundColor: COLORS.expenseItemBg, padding: 15, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  expenseDescription: { fontSize: 16, fontWeight: '500', color: COLORS.text, flexShrink:1 },
  expenseAmount: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  expensePaidBy: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 4 },
  expenseSplit: { fontSize: 14, color: COLORS.textSecondary, fontStyle:'italic' },
  itemDate: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right', marginTop: 8 },
  viewItemsText: { fontSize: 13, color: COLORS.primary, marginTop: 5, textAlign: 'right', fontWeight:'500' },
  settlementItem: { backgroundColor: COLORS.settlementItemBg, padding: 15, marginBottom: 12, borderRadius: 8, borderWidth:1, borderColor: COLORS.primary+'40' },
  settlementText: { fontSize: 16, color: COLORS.text },
  userName: { fontWeight: 'bold', color: COLORS.primary },
  settlementAmount: { fontWeight: 'bold', color: COLORS.accentPositive },
  settlementNote: { fontSize: 14, color: COLORS.textSecondary, marginTop: 5, fontStyle: 'italic' },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 15, color: COLORS.textSecondary },
});

export default GroupDetailScreen;
