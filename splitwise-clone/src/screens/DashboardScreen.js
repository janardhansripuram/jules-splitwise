import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, ScrollView, Dimensions, RefreshControl, FlatList } from 'react-native';
import { firebase } from '../../firebaseConfig';
import {
    Text as PaperText,
    useTheme,
    // MD3Colors, // No longer needed directly, use theme.colors
    Card as PaperCard,
    ActivityIndicator as PaperActivityIndicator,
    // Chip as PaperChip, // Removed from OverviewScene
    List as PaperList,
    Avatar as PaperAvatar,
    Button as PaperButton,
    FAB as PaperFAB,
    Portal
} from 'react-native-paper';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';
import { calculateNetBalance, calculateUserShareInExpense, calculateAllMemberBalances } from '../utils/balanceUtils';
import { generateDueExpenses } from '../utils/recurringExpenseManager';
import { fetchUsernames } from '../utils/userUtils';
import { formatDistanceToNow } from 'date-fns'; // Removed unused parseISO, format


// --- OverviewScene Component ---
const OverviewScene = ({ navigation, currentUserUidFromParent }) => {
  const theme = useTheme();
  const [overallOwedToUser, setOverallOwedToUser] = useState(0);
  const [overallUserOwes, setOverallUserOwes] = useState(0);
  const [netBalance, setNetBalance] = useState(0);
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDataAndBalancesForOverview = useCallback(async () => {
    if (!currentUserUidFromParent) return;
    setRefreshing(true); setIsLoadingBalances(true);
    let tempOwedToUser = 0; let tempUserOwes = 0;
    try {
      const groupsSnapshot = await firebase.firestore().collection('groups')
        .where('members', 'array-contains', { uid: currentUserUidFromParent, status: 'accepted', email: firebase.auth().currentUser.email })
        .get();
      for (const groupDoc of groupsSnapshot.docs) {
        const groupId = groupDoc.id;
        const groupExpensesSnapshot = await firebase.firestore().collection('expenses').where('groupId', '==', groupId).get();
        const groupExpensesData = groupExpensesSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        const groupSettlementsSnapshot = await firebase.firestore().collection('settlements').where('groupId', '==', groupId).get();
        const groupSettlementsData = groupSettlementsSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        const groupNetBalance = calculateNetBalance(groupExpensesData, groupSettlementsData, currentUserUidFromParent);
        if (groupNetBalance > 0) tempOwedToUser += groupNetBalance;
        else if (groupNetBalance < 0) tempUserOwes += Math.abs(groupNetBalance);
      }
      const personalExpensesQuery = firebase.firestore().collection('expenses').where('groupId', '==', null);
      const paidByMeSnapshot = await personalExpensesQuery.where('paidByUid', '==', currentUserUidFromParent).get();
      paidByMeSnapshot.forEach(doc => {
        const expense = { ...doc.data(), id: doc.id };
        if (expense.splitType && expense.splitType !== 'personal_solo' && expense.splitType !== 'personal' && (expense.memberOwes || expense.involvedUids?.length > 1)) {
            const myShare = calculateUserShareInExpense(expense, currentUserUidFromParent);
            if(expense.amount - myShare > 0) tempOwedToUser += (expense.amount - myShare);
        }
      });
      const allPersonalExpensesSnapshot = await personalExpensesQuery.get();
      allPersonalExpensesSnapshot.forEach(doc => {
          const expense = { ...doc.data(), id: doc.id };
          if (expense.paidByUid !== currentUserUidFromParent) {
              const userShare = calculateUserShareInExpense(expense, currentUserUidFromParent);
              if (userShare > 0) tempUserOwes += userShare;
          }
      });
      setOverallOwedToUser(parseFloat(tempOwedToUser.toFixed(2)));
      setOverallUserOwes(parseFloat(tempUserOwes.toFixed(2)));
      setNetBalance(parseFloat((tempOwedToUser - tempUserOwes).toFixed(2)));
    } catch (error) { console.error("Error fetching overview balances: ", error); Alert.alert("Error", "Could not calculate balances."); }
    finally { setIsLoadingBalances(false); setRefreshing(false); }
  }, [currentUserUidFromParent]);

  useEffect(() => { if (currentUserUidFromParent) fetchDataAndBalancesForOverview(); }, [currentUserUidFromParent, fetchDataAndBalancesForOverview]);
  const onRefreshOverview = () => fetchDataAndBalancesForOverview();

  const overviewStyles = StyleSheet.create({
    container: { flex: 1, padding: 15, backgroundColor: theme.colors.background },
    balanceCard: { marginBottom: 20, backgroundColor: theme.colors.surface, elevation: 2, borderRadius: theme.roundness },
    balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8, paddingHorizontal: 5 },
    balanceTextLabel: { color: theme.colors.onSurfaceVariant },
    balanceTextValue: { fontWeight: '600' },
    netBalanceSeparator: { height: 1, backgroundColor: theme.colors.outlineVariant, marginVertical: 10 },
    netBalanceLabel: { fontWeight: 'bold', color: theme.colors.onSurface },
    netBalanceValue: { fontWeight: 'bold' },
    loaderContainer: {flex:1, justifyContent:'center', alignItems:'center'},
    infoText: {textAlign:'center', color: theme.colors.onSurfaceVariant, marginHorizontal: 20, marginBottom:20, marginTop: 10, lineHeight: 20}
  });

  if (isLoadingBalances && !refreshing) return <View style={overviewStyles.loaderContainer}><PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" /></View>;

  return (
    <ScrollView
        style={overviewStyles.container}
        contentContainerStyle={{paddingBottom: 80}} // Padding for FAB
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshOverview} colors={[theme.colors.primary]}/>}
    >
      <PaperCard style={overviewStyles.balanceCard}>
        <PaperCard.Title title="Financial Overview" titleVariant="titleLarge" titleStyle={{color: theme.colors.onSurface}}/>
        <PaperCard.Content>
            <View style={overviewStyles.balanceRow}><PaperText variant="titleMedium" style={overviewStyles.balanceTextLabel}>You are owed:</PaperText><PaperText variant="titleMedium" style={[overviewStyles.balanceTextValue, {color: theme.colors.customSuccess}]}>${overallOwedToUser.toFixed(2)}</PaperText></View>
            <View style={overviewStyles.balanceRow}><PaperText variant="titleMedium" style={overviewStyles.balanceTextLabel}>You owe:</PaperText><PaperText variant="titleMedium" style={[overviewStyles.balanceTextValue, {color: theme.colors.error}]}>${overallUserOwes.toFixed(2)}</PaperText></View>
            <View style={[overviewStyles.netBalanceSeparator]} />
            <View style={overviewStyles.balanceRow}><PaperText variant="titleLarge" style={overviewStyles.netBalanceLabel}>Net:</PaperText><PaperText variant="titleLarge" style={[overviewStyles.netBalanceValue, { color: netBalance >= 0 ? theme.colors.customSuccess : theme.colors.error }]}>{netBalance >= 0 ? `You are owed $${netBalance.toFixed(2)}` : `You owe $${Math.abs(netBalance).toFixed(2)}`}{(Math.abs(netBalance) < 0.01) && "Settled up!"}</PaperText></View>
        </PaperCard.Content>
      </PaperCard>
      <PaperText variant="bodyMedium" style={overviewStyles.infoText}>
        Use the '+' button for common actions. Explore other tabs for detailed activity, groups, and friends.
      </PaperText>
  </ScrollView>
  );
};

// --- ActivityScene Component ---
const ActivityScene = ({ navigation, currentUserUidFromParent }) => {
  const theme = useTheme();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [usernamesMapForActivity, setUsernamesMapForActivity] = useState({});
  const [refreshingActivity, setRefreshingActivity] = useState(false);

  const fetchActivityData = useCallback(async () => { /* ... (logic as before) ... */
    if (!currentUserUidFromParent) return;
    setRefreshingActivity(true); setIsLoading(true); setUsernamesMapForActivity({});
    try {
      const allActivities = []; const uidsToFetch = new Set([currentUserUidFromParent]);
      const userEmail = firebase.auth().currentUser?.email;

      const personalExpensesSnap = await firebase.firestore().collection('expenses').where('groupId', '==', null).where('involvedUids', 'array-contains', currentUserUidFromParent).orderBy('createdAt', 'desc').limit(15).get();
      personalExpensesSnap.docs.forEach(doc => {
        const data = doc.data(); uidsToFetch.add(data.paidByUid); data.involvedUids?.forEach(uid => uidsToFetch.add(uid));
        allActivities.push({ id: `exp-${doc.id}`, type: 'expense', timestamp: data.createdAt.toDate(), description: data.description, amount: data.amount, paidByUid: data.paidByUid, involvedUids: data.involvedUids, splitType: data.splitType, memberOwes: data.memberOwes, amountPerMember: data.amountPerMember, originalDoc: data, screen: 'ExpenseDetail' });
      });

      if (userEmail) {
        const groupsSnap = await firebase.firestore().collection('groups').where('members', 'array-contains', { uid: currentUserUidFromParent, status: 'accepted', email: userEmail }).get();
        for (const groupDoc of groupsSnap.docs) {
          const groupId = groupDoc.id; const groupName = groupDoc.data().name; uidsToFetch.add(groupDoc.data().createdBy);
          const groupExpensesSnap = await firebase.firestore().collection('expenses').where('groupId', '==', groupId).orderBy('createdAt', 'desc').limit(10).get();
          groupExpensesSnap.docs.forEach(doc => {
            const data = doc.data(); uidsToFetch.add(data.paidByUid); data.involvedUids?.forEach(uid => uidsToFetch.add(uid));
            allActivities.push({ id: `grp-exp-${doc.id}`, type: 'expense', timestamp: data.createdAt.toDate(), description: data.description, amount: data.amount, paidByUid: data.paidByUid, involvedUids: data.involvedUids, splitType: data.splitType, memberOwes: data.memberOwes, amountPerMember: data.amountPerMember, group: { id: groupId, name: groupName }, originalDoc: data, screen: 'GroupDetailScreen' });
          });
          const groupSettlementsSnap = await firebase.firestore().collection('settlements').where('groupId', '==', groupId).orderBy('createdAt', 'desc').limit(5).get();
          groupSettlementsSnap.docs.forEach(doc => {
            const data = doc.data(); uidsToFetch.add(data.payerUid); uidsToFetch.add(data.receiverUid);
            allActivities.push({ id: `grp-set-${doc.id}`, type: 'settlement', timestamp: data.createdAt.toDate(), description: `Settlement in ${groupName}`, amount: data.amount, paidByUid: data.payerUid, receiverUid: data.receiverUid, note: data.note, group: { id: groupId, name: groupName }, originalDoc: data, screen: 'GroupDetailScreen' });
          });
        }
      }

      const personalSettlementsPaidSnap = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('payerUid', '==', currentUserUidFromParent).orderBy('createdAt', 'desc').limit(10).get();
      personalSettlementsPaidSnap.docs.forEach(doc => {
        const data = doc.data(); uidsToFetch.add(data.receiverUid);
        allActivities.push({ id: `psnl-set-${doc.id}`, type: 'settlement', timestamp: data.createdAt.toDate(), description: 'Personal Settlement', amount: data.amount, paidByUid: data.payerUid, receiverUid: data.receiverUid, note: data.note, originalDoc: data, screen: 'FriendsScreen' });
      });
      const personalSettlementsReceivedSnap = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('receiverUid', '==', currentUserUidFromParent).orderBy('createdAt', 'desc').limit(10).get();
      personalSettlementsReceivedSnap.docs.forEach(doc => {
        const data = doc.data(); uidsToFetch.add(data.payerUid);
         if (!allActivities.find(a => a.id === `psnl-set-${doc.id}`)) {
            allActivities.push({ id: `psnl-set-${doc.id}`, type: 'settlement', timestamp: data.createdAt.toDate(), description: 'Personal Settlement', amount: data.amount, paidByUid: data.payerUid, receiverUid: data.receiverUid, note: data.note, originalDoc: data, screen: 'FriendsScreen' });
         }
      });

      if (uidsToFetch.size > 0) { const names = await fetchUsernames(Array.from(uidsToFetch)); setUsernamesMapForActivity(names); }
      allActivities.sort((a, b) => b.timestamp - a.timestamp);
      setActivities(allActivities.slice(0, 50));
    } catch (error) { console.error("Error fetching activity data:", error); Alert.alert("Error", "Could not load activity feed."); }
    finally { setIsLoading(false); setRefreshingActivity(false); }
  }, [currentUserUidFromParent]);

  useEffect(() => { if (currentUserUidFromParent) fetchActivityData(); }, [currentUserUidFromParent, fetchActivityData]);
  const onRefreshActivity = () => fetchActivityData();

  const renderActivityListItem = ({ item }) => { /* ... (logic as before, ensure theme colors are used) ... */
    let title = item.description;
    let descriptionText = formatDistanceToNow(item.timestamp, { addSuffix: true });
    let leftIcon = "help-circle-outline";
    let amountText = "";
    const paidByName = usernamesMapForActivity[item.paidByUid] || 'User';
    if (item.type === 'expense') {
      leftIcon = "cash-multiple";
      const myShare = calculateUserShareInExpense(item.originalDoc, currentUserUidFromParent);
      if (item.paidByUid === currentUserUidFromParent) {
        title = `You paid for "${item.description}"`; amountText = `$${item.amount.toFixed(2)}`;
        if (item.group) descriptionText += ` in ${item.group.name}`;
        else if (item.originalDoc.involvedUids?.length > 1) descriptionText += ` (Shared)`;
      } else {
        title = `${paidByName} paid for "${item.description}"`;
        if (item.originalDoc.involvedUids?.includes(currentUserUidFromParent)) {
          amountText = `Your share: $${myShare.toFixed(2)}`;
        }
         if (item.group) descriptionText += ` in ${item.group.name}`;
      }
    } else if (item.type === 'settlement') {
      leftIcon = "swap-horizontal-bold";
      const receiverName = usernamesMapForActivity[item.receiverUid] || 'User';
      if (item.paidByUid === currentUserUidFromParent) { title = `You paid ${receiverName}`; amountText = `-$${item.amount.toFixed(2)}`; }
      else { title = `${paidByName} paid you`; amountText = `+$${item.amount.toFixed(2)}`; }
      if (item.group) descriptionText += ` in ${item.group.name}`;
      if (item.note) descriptionText += `\nNote: ${item.note}`;
    }
    return ( <PaperList.Item title={title} description={descriptionText} titleNumberOfLines={2} descriptionNumberOfLines={2}
        left={props => <PaperAvatar.Icon {...props} icon={leftIcon} size={40} style={{backgroundColor: theme.colors.surfaceVariant}} color={theme.colors.primary}/>}
        right={() => amountText ? <PaperText variant="bodyMedium" style={{alignSelf:'center', marginRight:10, color: item.type === 'settlement' && item.receiverUid === currentUserUidFromParent ? theme.colors.customSuccess : (item.type === 'settlement' && item.paidByUid === currentUserUidFromParent ? theme.colors.error : theme.colors.onSurface)}}>{amountText}</PaperText> : null}
        style={[styles_activity.listItem, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness}]} onPress={() => { /* TODO */}} />
    );
  };
  if (isLoading) return <View style={styles_activity.centered}><PaperActivityIndicator animating={true} color={theme.colors.primary} size="large"/></View>;
  return ( <View style={[styles_activity.container, {backgroundColor: theme.colors.background}]}>
      <FlatList data={activities} renderItem={renderActivityListItem} keyExtractor={item => item.id}
        ListEmptyComponent={<PaperText style={[styles_activity.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No recent activity.</PaperText>}
        refreshControl={<RefreshControl refreshing={refreshingActivity} onRefresh={onRefreshActivity} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
        contentContainerStyle={{paddingBottom:80, paddingTop: 10}} />
    </View>
  );
};
const styles_activity = StyleSheet.create({
    container: { flex: 1, }, centered: {flex:1, justifyContent:'center', alignItems:'center'},
    listItem: { marginBottom: 8, marginHorizontal:10, elevation: 1, }, // BG and borderRadius from theme
    noItemsText: { textAlign:'center', marginTop:30, fontSize:16 }
});

// --- GroupsScene Component ---
const GroupsScene = ({ navigation, currentUserUidFromParent }) => { /* ... (logic as before) ... */
  const theme = useTheme();
  const [summaryGroups, setSummaryGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchGroupSummaryData = useCallback(async () => { /* ... */
    if (!currentUserUidFromParent) return;
    setIsLoading(true); setRefreshing(true);
    try {
      const groupsSnapshot = await firebase.firestore().collection('groups')
        .where('members', 'array-contains', { uid: currentUserUidFromParent, status: 'accepted', email: firebase.auth().currentUser.email })
        .get();
      const groupPromises = groupsSnapshot.docs.map(async (groupDoc) => {
        const group = { id: groupDoc.id, ...groupDoc.data() };
        const expensesSnap = await firebase.firestore().collection('expenses').where('groupId', '==', group.id).orderBy('createdAt', 'desc').limit(1).get();
        const settlementsSnap = await firebase.firestore().collection('settlements').where('groupId', '==', group.id).orderBy('createdAt', 'desc').limit(1).get();
        let lastActivityDate = null;
        if (!expensesSnap.empty) lastActivityDate = expensesSnap.docs[0].data().createdAt.toDate();
        if (!settlementsSnap.empty) { const lastSettlementDate = settlementsSnap.docs[0].data().createdAt.toDate(); if (!lastActivityDate || lastSettlementDate > lastActivityDate) lastActivityDate = lastSettlementDate; }
        const groupExpenses = (await firebase.firestore().collection('expenses').where('groupId', '==', group.id).get()).docs.map(d => d.data());
        const groupSettlements = (await firebase.firestore().collection('settlements').where('groupId', '==', group.id).get()).docs.map(d => d.data());
        const netBalance = calculateNetBalance(groupExpenses, groupSettlements, currentUserUidFromParent);
        return { ...group, netBalance, lastActivityDate };
      });
      let groupsWithDetails = await Promise.all(groupPromises);
      groupsWithDetails.sort((a, b) => {
        if (Math.abs(a.netBalance) > 0.01 && Math.abs(b.netBalance) < 0.01) return -1; if (Math.abs(a.netBalance) < 0.01 && Math.abs(b.netBalance) > 0.01) return 1;
        if (Math.abs(a.netBalance) > Math.abs(b.netBalance)) return -1; if (Math.abs(a.netBalance) < Math.abs(b.netBalance)) return 1;
        return (b.lastActivityDate || 0) - (a.lastActivityDate || 0);
      });
      setSummaryGroups(groupsWithDetails.slice(0, 5));
    } catch (error) { console.error("Error fetching group summary:", error); Alert.alert("Error", "Could not load group summaries."); }
    finally { setIsLoading(false); setRefreshing(false); }
  }, [currentUserUidFromParent]);
  useEffect(() => { if (currentUserUidFromParent) fetchGroupSummaryData(); }, [currentUserUidFromParent, fetchGroupSummaryData]);
  const onRefreshGroups = () => fetchGroupSummaryData();

  if (isLoading) return <View style={styles_groups.centered}><PaperActivityIndicator animating={true} color={theme.colors.primary} size="large"/></View>;
  return ( <View style={[styles_groups.container, {backgroundColor: theme.colors.background}]}>
      <FlatList data={summaryGroups}
        renderItem={({item}) => (
          <PaperCard style={[styles_groups.card, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness}]} onPress={() => navigation.navigate('GroupDetailScreen', { groupId: item.id, groupName: item.name })} elevation={1}>
            <PaperCard.Title title={item.name} titleVariant="titleMedium"
              subtitle={`Your Balance: ${item.netBalance > 0 ? `Owed $${item.netBalance.toFixed(2)}` : item.netBalance < 0 ? `You Owe $${Math.abs(item.netBalance).toFixed(2)}` : 'Settled'}`}
              subtitleStyle={{color: item.netBalance > 0 ? theme.colors.customSuccess : item.netBalance < 0 ? theme.colors.error : theme.colors.onSurfaceVariant, fontWeight: item.netBalance !== 0 ? 'bold' : 'normal'}}
              left={(props) => <PaperAvatar.Icon {...props} icon="account-group" style={{backgroundColor: theme.colors.surfaceVariant}} color={theme.colors.primary}/>} />
            {item.lastActivityDate && <PaperCard.Content><PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant}}>Last activity: {formatDistanceToNow(item.lastActivityDate, {addSuffix: true})}</PaperText></PaperCard.Content>}
          </PaperCard> )}
        keyExtractor={item => item.id}
        ListEmptyComponent={<PaperText style={[styles_groups.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No groups to summarize.</PaperText>}
        ListFooterComponent={<PaperButton mode="contained" onPress={() => navigation.navigate('GroupsList')} style={[styles_groups.viewAllButton, {borderRadius: theme.roundness * 1.5}]} icon="format-list-bulleted">View All Groups</PaperButton>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshGroups} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
        contentContainerStyle={{padding:10, paddingBottom: 80}} />
    </View>
  );
};
const styles_groups = StyleSheet.create({
    container: { flex: 1 }, centered: {flex:1, justifyContent:'center', alignItems:'center'},
    card: { marginVertical: 8, marginHorizontal:5, elevation:1 }, // BG and borderRadius from theme
    viewAllButton: { marginVertical: 20, marginHorizontal: 10},
    noItemsText: { textAlign:'center', marginTop:30, fontSize:16 }
});

// --- FriendsSceneView Component ---
const FriendsSceneView = ({ navigation, currentUserUidFromParent }) => { /* ... (logic as before) ... */
  const theme = useTheme();
  const [summaryFriends, setSummaryFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchFriendSummaryData = useCallback(async () => { /* ... */
    if (!currentUserUidFromParent) return;
    setIsLoading(true); setRefreshing(true);
    try {
      const friendshipsSnap = await firebase.firestore().collection('friendships').where('userUids', 'array-contains', currentUserUidFromParent).where('status', '==', 'accepted').get();
      const friendPromises = friendshipsSnap.docs.map(async (doc) => {
        const data = doc.data(); const friendUid = data.userUids.find(uid => uid !== currentUserUidFromParent);
        if (!friendUid) return null;
        const friendName = (await fetchUsernames([friendUid]))[friendUid] || 'Friend';
        let netBalance = 0; let lastActivityDate = null;
        const personalExpensesSnap = await firebase.firestore().collection('expenses').where('groupId', '==', null).where('involvedUids', 'array-contains', currentUserUidFromParent).get();
        const relevantExpenses = personalExpensesSnap.docs.map(d=>d.data()).filter(exp => exp.involvedUids.includes(friendUid));
        relevantExpenses.forEach(expense => {
            const currentUserShare = calculateUserShareInExpense(expense, currentUserUidFromParent); const friendShare = calculateUserShareInExpense(expense, friendUid);
            if (expense.paidByUid === currentUserUidFromParent) netBalance += friendShare;
            else if (expense.paidByUid === friendUid) netBalance -= currentUserShare;
            if (expense.createdAt?.toDate() && (!lastActivityDate || expense.createdAt.toDate() > lastActivityDate)) lastActivityDate = expense.createdAt.toDate();
        });
        const settlementsPayerSnap = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('payerUid', '==', currentUserUidFromParent).where('receiverUid', '==', friendUid).get();
        settlementsPayerSnap.docs.forEach(doc => { const s = doc.data(); netBalance -= s.amount; if (s.createdAt?.toDate() && (!lastActivityDate || s.createdAt.toDate() > lastActivityDate)) lastActivityDate = s.createdAt.toDate(); });
        const settlementsReceiverSnap = await firebase.firestore().collection('settlements').where('groupId', '==', null).where('payerUid', '==', friendUid).where('receiverUid', '==', currentUserUidFromParent).get();
        settlementsReceiverSnap.docs.forEach(doc => { const s = doc.data(); netBalance += s.amount; if (s.createdAt?.toDate() && (!lastActivityDate || s.createdAt.toDate() > lastActivityDate)) lastActivityDate = s.createdAt.toDate(); });
        return { id: friendUid, name: friendName, netBalance: parseFloat(netBalance.toFixed(2)), lastActivityDate };
      });
      let friendsWithDetails = (await Promise.all(friendPromises)).filter(f => f !== null);
      friendsWithDetails.sort((a, b) => {
        if (Math.abs(a.netBalance) > 0.01 && Math.abs(b.netBalance) < 0.01) return -1; if (Math.abs(a.netBalance) < 0.01 && Math.abs(b.netBalance) > 0.01) return 1;
        if (Math.abs(a.netBalance) > Math.abs(b.netBalance)) return -1; if (Math.abs(a.netBalance) < Math.abs(b.netBalance)) return 1;
        return (b.lastActivityDate || 0) - (a.lastActivityDate || 0);
      });
      setSummaryFriends(friendsWithDetails.slice(0,5));
    } catch (error) { console.error("Error fetching friend summary:", error); Alert.alert("Error", "Could not load friend summaries."); }
    finally { setIsLoading(false); setRefreshing(false); }
  }, [currentUserUidFromParent]);
  useEffect(() => { if (currentUserUidFromParent) fetchFriendSummaryData(); }, [currentUserUidFromParent, fetchFriendSummaryData]);
  const onRefreshFriends = () => fetchFriendSummaryData();

  if (isLoading) return <View style={styles_friends.centered}><PaperActivityIndicator animating={true} color={theme.colors.primary} size="large"/></View>;
  return ( <View style={[styles_friends.container, {backgroundColor: theme.colors.background}]}>
      <FlatList data={summaryFriends}
        renderItem={({item}) => (
          <PaperCard style={[styles_friends.card, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness}]} onPress={() => navigation.navigate('FriendsScreen')} elevation={1}>
            <PaperCard.Title title={item.name} titleVariant="titleMedium"
              subtitle={`Direct Balance: ${item.netBalance > 0 ? `${item.name} owes you $${item.netBalance.toFixed(2)}` : item.netBalance < 0 ? `You owe ${item.name} $${Math.abs(item.netBalance).toFixed(2)}` : 'Settled'}`}
              subtitleStyle={{color: item.netBalance > 0 ? theme.colors.customSuccess : item.netBalance < 0 ? theme.colors.error : theme.colors.onSurfaceVariant, fontWeight: item.netBalance !== 0 ? 'bold' : 'normal'}}
              left={(props) => <PaperAvatar.Text {...props} size={40} label={item.name.substring(0,2).toUpperCase()} style={{backgroundColor: theme.colors.surfaceVariant}} color={theme.colors.primary}/>} />
             {item.lastActivityDate && <PaperCard.Content><PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant}}>Last activity: {formatDistanceToNow(item.lastActivityDate, {addSuffix: true})}</PaperText></PaperCard.Content>}
          </PaperCard> )}
        keyExtractor={item => item.id}
        ListEmptyComponent={<PaperText style={[styles_friends.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No friends with activity/balances.</PaperText>}
        ListFooterComponent={<PaperButton mode="contained" onPress={() => navigation.navigate('Friends')} style={[styles_friends.viewAllButton, {borderRadius: theme.roundness * 1.5}]} icon="account-heart-outline">View All Friends</PaperButton>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshFriends} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
        contentContainerStyle={{padding:10, paddingBottom: 80}} />
    </View>
  );
};
const styles_friends = StyleSheet.create({
    container: { flex: 1 }, centered: {flex:1, justifyContent:'center', alignItems:'center'},
    card: { marginVertical: 8, marginHorizontal:5, elevation:1 }, // BG and borderRadius from theme
    viewAllButton: { marginVertical: 20, marginHorizontal: 10},
    noItemsText: { textAlign:'center', marginTop:30, fontSize:16 }
});


function DashboardScreen({ navigation }) { /* ... (main DashboardScreen structure as before) ... */
  const theme = useTheme();
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [isProcessingRecurringExpenses, setIsProcessingRecurringExpenses] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  const [index, setIndex] = useState(0);
  const [routes] = useState([
    { key: 'overview', title: 'Overview' }, { key: 'activity', title: 'Activity' },
    { key: 'groups', title: 'Groups' }, { key: 'friends', title: 'Friends' },
  ]);

  useEffect(() => { const user = firebase.auth().currentUser; if (user) setCurrentUserUid(user.uid); else navigation.navigate('Login'); navigation.setOptions({ title: 'Dashboard' }); }, [navigation]);
  useEffect(() => { const runRecurringExpenseGeneration = async () => { if (isProcessingRecurringExpenses || !currentUserUid) return; setIsProcessingRecurringExpenses(true); try { const templatesSnapshot = await firebase.firestore().collection('recurringExpenses').where('userId', '==', currentUserUid).where('isActive', '==', true).get(); const templates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); if (templates.length > 0) { const batch = firebase.firestore().batch(); const generatedCount = await generateDueExpenses(currentUserUid, templates, batch); if (generatedCount > 0) { await batch.commit(); console.log(`Dashboard: Generated ${generatedCount} recurring expense(s).`); /* TODO: Consider global state/event for refresh */ } } } catch (error) { console.error("Dashboard: Error processing recurring expenses: ", error); } finally { setIsProcessingRecurringExpenses(false); } }; if (currentUserUid) runRecurringExpenseGeneration(); }, [currentUserUid, isProcessingRecurringExpenses]);

  const renderScene = ({ route, jumpTo }) => { /* ... (as before) ... */
    switch (route.key) {
      case 'overview': return <OverviewScene navigation={navigation} jumpTo={jumpTo} currentUserUidFromParent={currentUserUid} />;
      case 'activity': return <ActivityScene navigation={navigation} jumpTo={jumpTo} currentUserUidFromParent={currentUserUid} />;
      case 'groups': return <GroupsScene navigation={navigation} jumpTo={jumpTo} currentUserUidFromParent={currentUserUid} />;
      case 'friends': return <FriendsSceneView navigation={navigation} jumpTo={jumpTo} currentUserUidFromParent={currentUserUid} />;
      default: return null;
    }
  };
  const renderTabBar = props => ( <TabBar {...props} indicatorStyle={{ backgroundColor: theme.colors.primary }} style={{ backgroundColor: theme.colors.elevation.level2 }} labelStyle={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 13 }} activeColor={theme.colors.primary} inactiveColor={theme.colors.onSurfaceVariant} scrollEnabled={routes.length > 3} tabStyle={styles.tabStyle} /> );
  if (!currentUserUid) { return ( <View style={[styles.container, styles.centered, {backgroundColor: theme.colors.background}]}><PaperActivityIndicator animating={true} color={theme.colors.primary} /></View> ); }

  return (
    <View style={{flex:1}}>
      <TabView navigationState={{ index, routes }} renderScene={renderScene} onIndexChange={setIndex} initialLayout={{ width: Dimensions.get('window').width }} renderTabBar={renderTabBar} style={{backgroundColor: theme.colors.background}} />
      <Portal>
        <PaperFAB.Group open={fabOpen} visible={true} icon={fabOpen ? 'close' : 'plus'}
          actions={[ { icon: 'cash-plus', label: 'Add Expense', onPress: () => navigation.navigate('AddExpense'), small: false, }, { icon: 'account-multiple-plus-outline', label: 'Create Group', onPress: () => navigation.navigate('CreateGroupScreen'), small: true, }, { icon: 'account-plus-outline', label: 'Add Friend', onPress: () => navigation.navigate('Friends', { screen: 'AddFriendTab' }), small: true, }, ]}
          onStateChange={({ open }) => setFabOpen(open)}
          fabStyle={{backgroundColor: theme.colors.primaryContainer, borderRadius: theme.roundness * 2}} // Themed FAB, more rounded
          color={theme.colors.onPrimaryContainer} />
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center'},
  tabStyle: { width: 'auto', minWidth: Dimensions.get('window').width / 4.2, paddingHorizontal: 4, height: 48 },
});

export default DashboardScreen;
