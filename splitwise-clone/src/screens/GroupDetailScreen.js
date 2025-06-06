import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, RefreshControl, Dimensions, ScrollView, FlatList } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils';
import {
    Button as PaperButton,
    Text as PaperText,
    Card as PaperCard,
    ActivityIndicator as PaperActivityIndicator,
    useTheme,
    Portal,
    Dialog,
    List as PaperList,
    Avatar as PaperAvatar,
    Title as PaperTitle
    // Icon as PaperIcon // PaperIcon is not a direct export, use MaterialCommunityIcons
} from 'react-native-paper';
import { calculateNetBalance, calculateUserShareInExpense, calculateAllMemberBalances } from '../utils/balanceUtils';
import { simplifyDebts } from '../utils/debtUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { getCategoryFromDescription, CATEGORY_COLORS } from '../../utils/categoryUtils';
import { TabView, SceneMap, TabBar } from 'react-native-tab-view';

// --- Scene Components ---

const ExpensesActivityScene = ({ route, jumpTo, navigation, groupData, currentUserUid, usernamesMap, onRefresh, refreshing }) => {
  const theme = useTheme();
  const renderExpenseItem = ({ item }) => {
    let splitDetail = '';
    const myShareInExpense = calculateUserShareInExpense(item, currentUserUid);
    const payerName = usernamesMap[item.paidByUid] || `User ${item.paidByUid?.substring(0,6)}...`;
    if (item.splitType === 'equal') splitDetail = `Split equally (${(item.amountPerMember || 0).toFixed(2)} each)`;
    else if (item.splitType === 'exact') splitDetail = `Your share: $${myShareInExpense.toFixed(2)}`;
    else if (item.splitType === 'itemized') splitDetail = `Itemized - Your total share: $${myShareInExpense.toFixed(2)}`;

    return (
      <TouchableOpacity onPress={() => item.splitType === 'itemized' && navigation.navigate('ItemizedExpenseDetail', { expense: item, usernamesMap: usernamesMap })}>
        <PaperCard style={[styles_scene.activityItemCard, {backgroundColor: theme.colors.surface}]} elevation={1}>
          <PaperCard.Content>
            <View style={styles_scene.expenseHeader}>
              {item.recurringExpenseId && ( <MaterialCommunityIcons name="update" size={16} color={theme.colors.onSurfaceVariant} style={styles_scene.recurringIcon} /> )}
              <PaperText variant="titleMedium" style={[styles_scene.expenseDescription, item.recurringExpenseId && styles_scene.descriptionWithIcon]} numberOfLines={1}>{item.description}</PaperText>
              <PaperText variant="titleMedium" style={{color: theme.colors.primary}}>${item.amount ? item.amount.toFixed(2) : '0.00'}</PaperText>
            </View>
            <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant}}>Paid by: {item.paidByUid === currentUserUid ? "You" : payerName}</PaperText>
            <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant, fontStyle:'italic'}}>{splitDetail}</PaperText>
            {item.splitType === 'itemized' && <PaperText style={[styles_scene.viewItemsText, {color: theme.colors.primary}]}>(Tap to view items)</PaperText>}
            <PaperText variant="labelSmall" style={styles_scene.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</PaperText>
          </PaperCard.Content>
        </PaperCard>
      </TouchableOpacity>
    );
  };
  const renderSettlementItem = ({ item }) => {
    const payerName = usernamesMap[item.paidByUid] || `User ${item.paidByUid?.substring(0,6)}...`;
    const receiverName = usernamesMap[item.receiverUid] || `User ${item.receiverUid?.substring(0,6)}...`;
    return (
    <PaperCard style={[styles_scene.activityItemCard, {backgroundColor: theme.colors.elevation.level1}]} elevation={1}>
      <PaperCard.Content>
        <PaperText variant="bodyLarge">
          <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}>{item.paidByUid === currentUserUid ? "You" : payerName}</PaperText>
          {' paid '}
          <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}>{item.receiverUid === currentUserUid ? "You" : receiverName}</PaperText>
          <PaperText style={{fontWeight: 'bold', color: theme.colors.customSuccess}}>${item.amount.toFixed(2)}</PaperText>
        </PaperText>
        {item.note ? <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant, fontStyle:'italic', marginTop:4}}>Note: {item.note}</PaperText> : null}
        <PaperText variant="labelSmall" style={styles_scene.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</PaperText>
      </PaperCard.Content>
    </PaperCard>
  )};
  const combinedActivity = [...(groupData?.expenses || []), ...(groupData?.settlements || [])]
    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
  const renderActivityItem = ({ item }) => {
    if (item.type === 'settlement' || (item.payerUid && item.receiverUid)) { return renderSettlementItem({ item }); }
    return renderExpenseItem({ item });
  };
  return ( <FlatList data={combinedActivity} renderItem={renderActivityItem} keyExtractor={item => (item.type || 'exp') + item.id}
      style={{backgroundColor: theme.colors.background, flex:1}} contentContainerStyle={{padding:15, paddingBottom:80}}
      ListHeaderComponent={groupData?.currentUserNetBalance && (
         <PaperCard style={[styles_scene.balanceCard, {backgroundColor:theme.colors.surface}]} elevation={2}>
            <PaperCard.Title title="Your Group Balance" titleVariant="titleLarge" titleStyle={{color: theme.colors.onSurface}}/>
            <PaperCard.Content>
                <PaperText variant="headlineSmall" style={{textAlign:'center', color: groupData.currentUserNetBalance.netBalance >=0 ? theme.colors.customSuccess : theme.colors.error}}>
                    {groupData.currentUserNetBalance.settled ? "You are settled up" : groupData.currentUserNetBalance.netBalance > 0 ? `You are owed $${groupData.currentUserNetBalance.netBalance.toFixed(2)}` : `You owe $${Math.abs(groupData.currentUserNetBalance.netBalance).toFixed(2)}`}
                </PaperText>
            </PaperCard.Content>
        </PaperCard> )}
      ListEmptyComponent={<PaperText style={[styles_scene.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No activity yet.</PaperText>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>} />
  );
};

const MembersScene = ({ route, jumpTo, navigation, groupData, currentUserUid, usernamesMap, onSimplifyDebts, onRefresh, refreshing }) => {
  const theme = useTheme();
  if (!groupData || !groupData.members) return <PaperActivityIndicator color={theme.colors.primary}/>;
  return ( <FlatList data={groupData.members.filter(m => m.status === 'accepted')} keyExtractor={item => item.uid}
        style={{backgroundColor: theme.colors.background, flex:1}} contentContainerStyle={{padding:15, paddingBottom:80}}
        ListHeaderComponent={ <>
                <View style={styles_scene.actionButtonsContainer}>
                    <PaperButton mode="outlined" onPress={() => navigation.navigate('InviteMembers', { groupId: groupData.id })} style={styles_scene.actionButton} icon="account-plus-outline">Invite</PaperButton>
                    <PaperButton mode="outlined" onPress={() => navigation.navigate('RecordPayment', { groupId: groupData.id, groupName: groupData.name, members: groupData.members.filter(m=>m.status==='accepted') })} style={styles_scene.actionButton} icon="arrow-left-right">Record Pymt</PaperButton>
                </View>
                <PaperButton mode="elevated" onPress={onSimplifyDebts} style={styles_scene.simplifyButton} icon="calculator-variant-outline" disabled={!groupData.members || groupData.members.filter(m=>m.status==='accepted').length < 2}>Simplify Debts</PaperButton>
                <PaperText variant="titleMedium" style={{marginVertical:10, color:theme.colors.onBackground, paddingHorizontal:5}}>Members & Balances</PaperText>
            </> }
        renderItem={({item: member}) => {
            const balance = groupData.groupMemberBalances?.[member.uid] || 0;
            let balanceColor = balance === 0 ? theme.colors.onSurfaceVariant : balance > 0 ? theme.colors.customSuccess : theme.colors.error;
            return ( <PaperList.Item title={usernamesMap[member.uid] || member.email}
                    description={balance === 0 ? "Settled" : balance > 0 ? `Owed $${balance.toFixed(2)}` : `Owes $${Math.abs(balance).toFixed(2)}`}
                    descriptionStyle={{color: balanceColor, fontWeight: balance !== 0 ? 'bold' : 'normal'}}
                    left={props => <PaperAvatar.Text {...props} size={36} label={(usernamesMap[member.uid] || member.email).substring(0,2).toUpperCase()} style={{backgroundColor:theme.colors.surfaceVariant}} color={theme.colors.primary}/>}
                    style={[styles_scene.memberItem, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness}]} /> );}}
        ListEmptyComponent={<PaperText style={[styles_scene.noItemsText, {color: theme.colors.onSurfaceVariant}]}>No accepted members.</PaperText>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>} />
  );
};

const AnalyticsScene = ({ route, jumpTo, groupData }) => { /* ... (existing AnalyticsScene code, no changes needed for this subtask) ... */
  const theme = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const [chartData, setChartData] = useState([]);
  const [isLoadingChartData, setIsLoadingChartData] = useState(true);
  useEffect(()=>{
    if (groupData?.expenses && groupData.expenses.length > 0) {
      setIsLoadingChartData(true);
      const categorySpending = {};
      groupData.expenses.forEach(expense => {
        const category = getCategoryFromDescription(expense.description);
        categorySpending[category] = (categorySpending[category] || 0) + parseFloat(expense.amount || 0);
      });
      const formattedChartData = Object.keys(categorySpending).filter(category => categorySpending[category] > 0)
        .map(category => ({ name: category, population: parseFloat(categorySpending[category].toFixed(2)),
          color: CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'],
          legendFontColor: theme.colors.onSurfaceVariant, legendFontSize: 13, }));
      setChartData(formattedChartData); setIsLoadingChartData(false);
    } else { setChartData([]); setIsLoadingChartData(false); }
  }, [groupData?.expenses, theme.colors.onSurfaceVariant]);
  if (isLoadingChartData && !groupData?.expenses) return <View style={[styles_scene.centered, {backgroundColor: theme.colors.background}]}><PaperActivityIndicator color={theme.colors.primary}/></View>
  return ( <ScrollView style={[styles_scene.container,{backgroundColor: theme.colors.background}]} contentContainerStyle={{paddingBottom:80}}>
        <PaperCard style={[styles_scene.chartCard, {backgroundColor: theme.colors.surface}]} elevation={1}>
            <PaperCard.Title title="Spending by Category" titleVariant="titleMedium"
                left={(props) => <MaterialCommunityIcons {...props} name="chart-pie" color={theme.colors.primary} />}
                titleStyle={{color: theme.colors.onSurface}} />
            <PaperCard.Content>
            {isLoadingChartData ? <PaperActivityIndicator color={theme.colors.primary}/> : chartData.length === 0 ?
                <View style={styles_scene.loadingContainer}><MaterialCommunityIcons name="chart-arc-variant" size={48} color={theme.colors.onSurfaceVariant} /><PaperText style={styles_scene.noDataText}>No spending data for chart.</PaperText></View> :
                <View style={styles_scene.chartContentWrapper}>
                    <PieChart data={chartData} width={screenWidth - 64} height={230}
                    chartConfig={{ backgroundColor: theme.colors.surface, backgroundGradientFrom: theme.colors.surface, backgroundGradientTo: theme.colors.surface, decimalPlaces: 2, color: (opacity = 1) => theme.colors.onSurface, labelColor: (opacity = 1) => theme.colors.onSurfaceVariant, style: { borderRadius: theme.roundness }, propsForLabels:{fontSize:11} }}
                    accessor={"population"} backgroundColor={"transparent"} paddingLeft={"10"} absolute />
                </View>}
            </PaperCard.Content></PaperCard></ScrollView>
  );
};

const GroupSettingsScene = ({ route, jumpTo, navigation, groupData }) => {
    const theme = useTheme();
    return (
        <View style={[styles_scene.centeredContainer, {backgroundColor: theme.colors.background}]}>
          <MaterialCommunityIcons name="cog-outline" size={48} color={theme.colors.onSurfaceVariant} />
          <PaperTitle style={[styles_scene.settingsTitle, { color: theme.colors.onSurface }]}>
            Settings for {groupData?.name || 'Group'}
          </PaperTitle>
          <PaperText variant="bodyMedium" style={[styles_scene.settingsMessage, { color: theme.colors.onSurfaceVariant }]}>
            Options to manage this group (like editing group name or leaving the group) will be available here in a future update.
          </PaperText>
        </View>
      );
};

// --- Main GroupDetailScreen ---
function GroupDetailScreen({ route, navigation }) { /* ... (Main component logic as before) ... */
  const theme = useTheme();
  const { groupId, groupName: initialGroupName } = route.params;
  const [groupData, setGroupData] = useState({ id: groupId, name: initialGroupName, members: [], expenses: [], settlements: [], currentUserNetBalance: { netBalance: 0, settled: true }, groupMemberBalances: {}, });
  const [usernamesMap, setUsernamesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [isSimplifyModalVisible, setIsSimplifyModalVisible] = useState(false);
  const [simplifiedTransactionsList, setSimplifiedTransactionsList] = useState([]);
  const [isCalculatingSimplifiedDebts, setIsCalculatingSimplifiedDebts] = useState(false);
  const [index, setIndex] = useState(0);
  const [routes] = useState([ { key: 'activity', title: 'Activity' }, { key: 'members', title: 'Members' }, { key: 'analytics', title: 'Analytics' }, { key: 'settings', title: 'Settings' }, ]);

  useEffect(() => { const user = firebase.auth().currentUser; if (user) setCurrentUserUid(user.uid); else navigation.navigate('Login'); }, [navigation]);
  const fetchData = useCallback(async () => { /* ... (data fetching logic as before) ... */
    if (!currentUserUid || !groupId) return;
    setRefreshing(true); setLoading(true);
    const uidsToFetch = new Set();
    try {
      const groupDoc = await firebase.firestore().collection('groups').doc(groupId).get();
      if (!groupDoc.exists) { Alert.alert("Error", "Group not found."); navigation.goBack(); return; }
      const fetchedGroupDetails = groupDoc.data();
      navigation.setOptions({ title: fetchedGroupDetails.name || initialGroupName });
      const memberUids = fetchedGroupDetails.members?.map(m => m.uid) || [];
      memberUids.forEach(uid => uidsToFetch.add(uid));
      const namesMapForGroupMembers = memberUids.length > 0 ? await fetchUsernames(memberUids) : {};
      const populatedMembers = fetchedGroupDetails.members.map(m => ({...m, name: namesMapForGroupMembers[m.uid] || m.email}));
      const expensesSnapshot = await firebase.firestore().collection('expenses').where('groupId', '==', groupId).orderBy('createdAt', 'desc').get();
      const expensesArray = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      expensesArray.forEach(exp => { uidsToFetch.add(exp.paidByUid); exp.involvedUids?.forEach(uid => uidsToFetch.add(uid)); if(exp.memberOwes) Object.keys(exp.memberOwes).forEach(uid => uidsToFetch.add(uid)); });
      const settlementsSnapshot = await firebase.firestore().collection('settlements').where('groupId', '==', groupId).orderBy('createdAt', 'desc').get();
      const settlementsArray = settlementsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      settlementsArray.forEach(sett => { uidsToFetch.add(sett.payerUid); uidsToFetch.add(sett.receiverUid); });
      let finalUsernamesMap = {...namesMapForGroupMembers};
      if (uidsToFetch.size > 0) { const namesMapForActivities = await fetchUsernames(Array.from(uidsToFetch)); finalUsernamesMap = {...finalUsernamesMap, ...namesMapForActivities}; }
      setUsernamesMap(finalUsernamesMap);
      const acceptedMemberUids = populatedMembers.filter(m => m.status === 'accepted').map(m => m.uid);
      const allBalancesMap = acceptedMemberUids.length > 0 ? calculateAllMemberBalances(expensesArray, settlementsArray, acceptedMemberUids) : {};
      const currentUserBalance = allBalancesMap[currentUserUid] || 0;
      setGroupData({ id: groupId, name: fetchedGroupDetails.name, members: populatedMembers, expenses: expensesArray, settlements: settlementsArray, currentUserNetBalance: { netBalance: currentUserBalance, settled: Math.abs(currentUserBalance) < 0.01 }, groupMemberBalances: allBalancesMap, });
    } catch (error) { console.error("Error fetching group data: ", error); Alert.alert("Error", "Could not fetch group data."); }
    finally { setRefreshing(false); setLoading(false); }
  }, [groupId, currentUserUid, navigation, initialGroupName]);
  useEffect(() => { if (currentUserUid && groupId) fetchData(); }, [currentUserUid, groupId, fetchData]);
  const handleSimplifyDebts = () => { /* ... (logic as before) ... */
    if (!groupData || !groupData.members || Object.keys(groupData.groupMemberBalances).length === 0) { Alert.alert("No Balances", "No member balances to simplify."); return; }
    setIsCalculatingSimplifiedDebts(true);
    const balancesToSimplify = {};
    groupData.members.forEach(member => { if(member.status === 'accepted' && groupData.groupMemberBalances[member.uid] !== undefined) { balancesToSimplify[member.uid] = groupData.groupMemberBalances[member.uid]; }});
    const transactions = simplifyDebts(balancesToSimplify);
    setSimplifiedTransactionsList(transactions);
    setIsCalculatingSimplifiedDebts(false);
    setIsSimplifyModalVisible(true);
  };
  const renderScene = ({ route, jumpTo }) => { /* ... (logic as before) ... */
    const sceneProps = { route, jumpTo, navigation, groupData, currentUserUid, usernamesMap, onRefresh: fetchData, refreshing };
    if (route.key === 'members') sceneProps.onSimplifyDebts = handleSimplifyDebts;
    switch (route.key) {
      case 'activity': return <ExpensesActivityScene {...sceneProps} />;
      case 'members': return <MembersScene {...sceneProps} />;
      case 'analytics': return <AnalyticsScene {...sceneProps} />;
      case 'settings': return <GroupSettingsScene {...sceneProps} />;
      default: return null;
    }
  };
  const renderTabBar = props => ( <TabBar {...props} indicatorStyle={{ backgroundColor: theme.colors.primary }} style={{ backgroundColor: theme.colors.elevation.level2 }} labelStyle={{ color: theme.colors.onSurface, fontWeight: '600', fontSize:13 }} activeColor={theme.colors.primary} inactiveColor={theme.colors.onSurfaceVariant} scrollEnabled={routes.length > 3} tabStyle={styles_main.tabStyle}/> );
  if (loading || !groupData?.name) {
    return <View style={[styles_main.centered, {backgroundColor: theme.colors.background}]}><PaperActivityIndicator size="large" color={theme.colors.primary} /><PaperText>Loading Group...</PaperText></View>;
  }
  return ( <View style={{flex:1}}>
      <TabView navigationState={{ index, routes }} renderScene={renderScene} onIndexChange={setIndex} initialLayout={{ width: Dimensions.get('window').width }} renderTabBar={renderTabBar} style={{backgroundColor: theme.colors.background}} />
      <Portal><Dialog visible={isSimplifyModalVisible} onDismiss={() => setIsSimplifyModalVisible(false)} style={{backgroundColor: theme.colors.surface}}>
          <Dialog.Title style={{color: theme.colors.onSurface}}>Simplified Group Debts</Dialog.Title>
          <Dialog.ScrollArea style={{maxHeight: 400, paddingHorizontal:0}}><ScrollView>
            {isCalculatingSimplifiedDebts ? <PaperActivityIndicator animating={true} color={theme.colors.primary}/> :
              simplifiedTransactionsList.length === 0 ? <PaperText style={[styles_main.noItemsText, {color:theme.colors.onSurfaceVariant}]}>Everyone is settled up!</PaperText> :
              <FlatList data={simplifiedTransactionsList} keyExtractor={(item, idx) => `txn-${idx}`}
                renderItem={({item}) => ( <View style={styles_main.transactionItem}><PaperText variant="bodyMedium" style={{color: theme.colors.onSurface}}>
                      <PaperText style={{fontWeight: 'bold'}}>{usernamesMap[item.fromUid] || item.fromUid.substring(0,6)}</PaperText> {' pays '}
                      <PaperText style={{fontWeight: 'bold'}}>{usernamesMap[item.toUid] || item.toUid.substring(0,6)}</PaperText>
                      <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}> ${item.amount.toFixed(2)}</PaperText>
                    </PaperText></View> )}/>}
            </ScrollView><PaperText style={[styles_main.disclaimerText, {color: theme.colors.onSurfaceVariant}]}>These are suggested payments. Record actual payments using 'Record Payment'.</PaperText>
          </Dialog.ScrollArea><Dialog.Actions><PaperButton onPress={() => setIsSimplifyModalVisible(false)} textColor={theme.colors.primary}>Close</PaperButton></Dialog.Actions>
        </Dialog></Portal></View>
  );
}

// Styles for scenes
const styles_scene = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  balanceCard: { marginBottom: 15, elevation: 1 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6, paddingHorizontal:5 },
  netBalanceSeparator: { height: 1, marginVertical: 8 },
  activityItemCard: { marginBottom: 10, borderWidth:0 },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', marginBottom: 6 },
  recurringIcon: { marginRight: 8 }, descriptionWithIcon: { flexShrink:1, maxWidth: '80%' },
  expenseDescription: { flexShrink:1 }, expenseAmount: { fontWeight: 'bold' },
  expensePaidBy: { fontSize:13, marginTop:3, marginBottom: 2 }, expenseSplit: { fontSize:13, fontStyle:'italic' },
  itemDate: { fontSize: 12, textAlign: 'right', marginTop: 6, opacity:0.7 },
  viewItemsText: { fontSize: 13, marginTop: 4, textAlign: 'right', fontWeight:'500' },
  settlementItem: { padding: 15, marginBottom: 12, borderRadius: 8, borderWidth:1, }, // This style seems unused as settlements use PaperCard now
  settlementText: { fontSize: 16 }, // This style seems unused
  userName: { fontWeight: 'bold' }, // This style seems unused
  settlementAmount: { fontWeight: 'bold' }, // This style seems unused
  settlementNote: { fontSize: 14, marginTop: 5, fontStyle:'italic' }, // This style seems unused
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 15 },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15, paddingHorizontal:5 },
  actionButton: { flex: 0.48, },
  simplifyButton: { marginHorizontal:10, marginBottom:15},
  memberItem: {marginBottom:8, elevation:1},
  chartCard: { marginVertical: 10, elevation:1 }, chartCardContent: { alignItems: 'center', padding: 10, },
  loadingContainer: { height: 230, justifyContent: 'center', alignItems: 'center', },
  loadingText: { marginTop: 10, fontSize: 15, },
  noDataText: { textAlign: 'center', paddingVertical: 20, fontSize: 15, },
  chartContentWrapper: {alignItems:'center'},
  settingsTitle: { marginTop: 16, marginBottom: 12, textAlign: 'center', fontSize: 20 }, // Adjusted for PaperTitle/PaperText variant
  settingsMessage: { textAlign: 'center', lineHeight: 22, paddingHorizontal: 15, fontSize: 16 }, // Adjusted for PaperText variant
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
});

const styles_main = StyleSheet.create({
  container: { flex: 1 }, centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabStyle: { width: 'auto', minWidth: Dimensions.get('window').width / 4.2, paddingHorizontal: 4, height: 48 },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 15, },
  transactionItem: { paddingVertical: 12, borderBottomWidth: 1, },
  disclaimerText: {fontSize: 13, textAlign:'center', marginTop:15, fontStyle:'italic',},
});

export default GroupDetailScreen;
