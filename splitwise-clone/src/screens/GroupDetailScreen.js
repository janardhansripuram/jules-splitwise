import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, TouchableOpacity, RefreshControl, Dimensions, ScrollView } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils';
import { Button as PaperButton, Text as PaperText, Card as PaperCard, ActivityIndicator as PaperActivityIndicator, useTheme, Portal, Dialog, MD3Colors } from 'react-native-paper';
import { calculateNetBalance, calculateUserShareInExpense, calculateAllMemberBalances } from '../utils/balanceUtils';
import { simplifyDebts } from '../utils/debtUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { getCategoryFromDescription, CATEGORY_COLORS } from '../../utils/categoryUtils';

function GroupDetailScreen({ route, navigation }) {
  const theme = useTheme(); // THEME HOOK
  const { groupId, groupName } = route.params;

  const [groupExpenses, setGroupExpenses] = useState([]);
  const [groupSettlements, setGroupSettlements] = useState([]);
  const [groupDetails, setGroupDetails] = useState(null);
  const [usernamesMap, setUsernamesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserNetBalance, setCurrentUserNetBalance] = useState({ netBalance: 0, settled: true });
  const [groupMemberBalances, setGroupMemberBalances] = useState({});
  const [currentUserUid, setCurrentUserUid] = useState(null);

  const [pieChartData, setPieChartData] = useState([]);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  const [isSimplifyModalVisible, setIsSimplifyModalVisible] = useState(false);
  const [simplifiedTransactionsList, setSimplifiedTransactionsList] = useState([]);
  const [isCalculatingSimplifiedDebts, setIsCalculatingSimplifiedDebts] = useState(false);

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
    setLoading(true);

    const uidsToFetch = new Set();
    try {
      const groupDoc = await firebase.firestore().collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        Alert.alert("Error", "Group not found."); navigation.goBack(); return;
      }
      const currentGroupData = groupDoc.data();
      const memberUids = currentGroupData.members?.map(m => m.uid) || [];
      memberUids.forEach(uid => uidsToFetch.add(uid));

      const namesMapForGroupMembers = memberUids.length > 0 ? await fetchUsernames(memberUids) : {};
      const populatedMembers = currentGroupData.members.map(m => ({...m, name: namesMapForGroupMembers[m.uid] || m.email}));
      setGroupDetails({...currentGroupData, members: populatedMembers});

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
        setUsernamesMap(prev => ({...prev, ...namesMap}));
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
    if (!currentUserUid || loading || refreshing || !groupDetails?.members) return;
    const acceptedMemberUids = groupDetails.members.filter(m => m.status === 'accepted').map(m => m.uid);
    if (acceptedMemberUids.length === 0) {
        setCurrentUserNetBalance({ netBalance: 0, settled: true });
        setGroupMemberBalances({});
        return;
    }
    const allBalances = calculateAllMemberBalances(groupExpenses, groupSettlements, acceptedMemberUids);
    setGroupMemberBalances(allBalances);
    const currentUserBalance = allBalances[currentUserUid] || 0;
    setCurrentUserNetBalance({ netBalance: currentUserBalance, settled: Math.abs(currentUserBalance) < 0.01 });
  }, [groupExpenses, groupSettlements, groupDetails, currentUserUid, loading, refreshing]);

  useEffect(() => {
    if (groupExpenses && groupExpenses.length > 0) {
      setIsLoadingChart(true);
      const categorySpending = {};
      groupExpenses.forEach(expense => {
        const category = getCategoryFromDescription(expense.description);
        categorySpending[category] = (categorySpending[category] || 0) + parseFloat(expense.amount || 0);
      });
      const chartData = Object.keys(categorySpending)
        .filter(category => categorySpending[category] > 0)
        .map(category => ({
          name: category, population: parseFloat(categorySpending[category].toFixed(2)),
          color: CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'],
          legendFontColor: theme.colors.onSurfaceVariant, legendFontSize: 13,
        }));
      setPieChartData(chartData);
      setIsLoadingChart(false);
    } else {
      setPieChartData([]); setIsLoadingChart(false);
    }
  }, [groupExpenses, theme.colors.onSurfaceVariant]);

  const handleSimplifyDebts = () => { /* ... (no change) ... */
    if (!groupDetails || !groupDetails.members || Object.keys(groupMemberBalances).length === 0) {
      Alert.alert("No Balances", "No member balances calculated yet to simplify."); return;
    }
    setIsCalculatingSimplifiedDebts(true);
    const balancesToSimplify = {};
    groupDetails.members.forEach(member => {
        if(member.status === 'accepted' && groupMemberBalances[member.uid] !== undefined) {
            balancesToSimplify[member.uid] = groupMemberBalances[member.uid];
        }
    });
    const transactions = simplifyDebts(balancesToSimplify);
    setSimplifiedTransactionsList(transactions);
    setIsCalculatingSimplifiedDebts(false);
    setIsSimplifyModalVisible(true);
  };

  const renderExpenseItem = ({ item }) => {
    if (!currentUserUid) return null;
    let splitDetail = '';
    const myShareInExpense = calculateUserShareInExpense(item, currentUserUid);
    const payerName = usernamesMap[item.paidByUid] || `User ${item.paidByUid?.substring(0,6)}...`;

    if (item.splitType === 'equal') splitDetail = `Split equally (${(item.amountPerMember || 0).toFixed(2)} each)`;
    else if (item.splitType === 'exact') splitDetail = `Your share: $${myShareInExpense.toFixed(2)}`;
    else if (item.splitType === 'itemized') splitDetail = `Itemized - Your total share: $${myShareInExpense.toFixed(2)}`;

    return (
      <TouchableOpacity onPress={() => item.splitType === 'itemized' && navigation.navigate('ItemizedExpenseDetail', { expense: item, usernamesMap: usernamesMap })}>
        <PaperCard style={styles.activityItemCard} elevation={1}>
          <PaperCard.Content>
            <View style={styles.expenseHeader}>
              {item.recurringExpenseId && ( <MaterialCommunityIcons name="update" size={16} color={theme.colors.onSurfaceVariant} style={styles.recurringIcon} /> )}
              <PaperText variant="titleMedium" style={[styles.expenseDescription, item.recurringExpenseId && styles.descriptionWithIcon]} numberOfLines={1}>{item.description}</PaperText>
              <PaperText variant="titleMedium" style={{color: theme.colors.primary}}>${item.amount ? item.amount.toFixed(2) : '0.00'}</PaperText>
            </View>
            <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant}}>Paid by: {item.paidByUid === currentUserUid ? "You" : payerName}</PaperText>
            <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant, fontStyle:'italic'}}>{splitDetail}</PaperText>
            {item.splitType === 'itemized' && <PaperText style={[styles.viewItemsText, {color: theme.colors.primary}]}>(Tap to view items)</PaperText>}
            <PaperText variant="labelSmall" style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</PaperText>
          </PaperCard.Content>
        </PaperCard>
      </TouchableOpacity>
    );
  };
  const renderSettlementItem = ({ item }) => {
    const payerName = usernamesMap[item.payerUid] || `User ${item.payerUid?.substring(0,6)}...`;
    const receiverName = usernamesMap[item.receiverUid] || `User ${item.receiverUid?.substring(0,6)}...`;
    return (
    <PaperCard style={[styles.activityItemCard, {backgroundColor: theme.colors.elevation.level1}]} elevation={1}>
      <PaperCard.Content>
        <PaperText variant="bodyLarge">
          <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}>{item.payerUid === currentUserUid ? "You" : payerName}</PaperText>
          {' paid '}
          <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}>{item.receiverUid === currentUserUid ? "You" : receiverName}</PaperText>
          <PaperText style={{fontWeight: 'bold', color: theme.colors.customSuccess || MD3Colors.green600}}> ${item.amount.toFixed(2)}</PaperText>
        </PaperText>
        {item.note ? <PaperText variant="bodySmall" style={{color: theme.colors.onSurfaceVariant, fontStyle:'italic', marginTop:4}}>Note: {item.note}</PaperText> : null}
        <PaperText variant="labelSmall" style={styles.itemDate}>{item.createdAt?.toDate().toLocaleDateString()}</PaperText>
      </PaperCard.Content>
    </PaperCard>
  )};
  const renderBalanceSummary = () => {
    let balanceText = "Calculating balance...";
    let balanceStyle = {color: theme.colors.onSurfaceVariant};

    if (!loading && !refreshing) {
        if (currentUserNetBalance.settled) {
            balanceText = "You are settled up in this group!";
            balanceStyle = {color: theme.colors.customSuccess || MD3Colors.green600, fontWeight:'bold'};
        } else if (currentUserNetBalance.netBalance > 0) {
            balanceText = `Overall, you are owed: $${currentUserNetBalance.netBalance.toFixed(2)}`;
            balanceStyle = {color: theme.colors.customSuccess || MD3Colors.green600, fontWeight:'bold'};
        } else {
            balanceText = `Overall, you owe: $${Math.abs(currentUserNetBalance.netBalance).toFixed(2)}`;
            balanceStyle = {color: theme.colors.error, fontWeight:'bold'};
        }
    }
    return <PaperText variant="titleLarge" style={[styles.balanceSummaryText, balanceStyle]}>{balanceText}</PaperText>;
  };

  if (loading && !refreshing && !groupDetails) {
    return <View style={[styles.centered, {backgroundColor: theme.colors.background}]}><PaperActivityIndicator size="large" color={theme.colors.primary} /><PaperText>Loading details...</PaperText></View>;
  }

  const combinedActivity = [...groupExpenses, ...groupSettlements].sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
  const renderActivityItem = ({ item }) => {
    if (item.type === 'settlement') { return renderSettlementItem({ item }); }
    return renderExpenseItem({ item });
  };
  const screenWidth = Dimensions.get('window').width;
  const renderChartSection = () => {
    if (isLoadingChart) {
      return ( <View style={[styles.chartCardContent, styles.loadingContainer]}><PaperActivityIndicator animating={true} size="large" color={theme.colors.primary} /><PaperText style={styles.loadingText}>Loading Chart...</PaperText></View> );
    }
    if (pieChartData.length === 0) {
      return ( <View style={[styles.chartCardContent, styles.loadingContainer]}><MaterialCommunityIcons name="chart-arc-variant" size={48} color={theme.colors.onSurfaceVariant} /><PaperText style={styles.noDataText}>No spending data for chart.</PaperText></View> );
    }
    return (
      <View style={styles.chartCardContent}>
        <PieChart data={pieChartData} width={screenWidth - (styles.chartCard.marginHorizontal * 2) - (styles.chartCardContent.padding * 2) -10} height={230}
          chartConfig={{ backgroundColor: theme.colors.surface, backgroundGradientFrom: theme.colors.surface, backgroundGradientTo: theme.colors.surface, decimalPlaces: 2, color: (opacity = 1) => theme.colors.onSurface, labelColor: (opacity = 1) => theme.colors.onSurfaceVariant, style: { borderRadius: 10 }, propsForLabels: { fontSize: 11, fill: theme.colors.onSurfaceVariant } }}
          accessor={"population"} backgroundColor={"transparent"} paddingLeft={"10"} absolute />
      </View>
    );
  };

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <FlatList
        ListHeaderComponent={
          <>
            <PaperCard style={styles.balanceContainer} elevation={2}>{renderBalanceSummary()}</PaperCard>
            <View style={styles.actionButtonsContainer}>
              <PaperButton mode="outlined" onPress={() => navigation.navigate('InviteMembers', { groupId: groupId })} style={styles.actionButton} icon="account-plus-outline">Invite</PaperButton>
              <PaperButton mode="outlined" onPress={() => navigation.navigate('RecordPayment', { groupId: groupId })} style={styles.actionButton} icon="arrow-left-right">Record Pymt</PaperButton>
            </View>
            <PaperButton mode="elevated" onPress={handleSimplifyDebts} style={styles.simplifyButton} icon="calculator-variant-outline" disabled={isCalculatingSimplifiedDebts || loading || Object.keys(groupMemberBalances).length === 0 || groupDetails?.members?.filter(m => m.status === 'accepted').length < 2}>Simplify Debts</PaperButton>

            <PaperCard style={styles.membersContainer} elevation={1}>
              <PaperCard.Title title="Accepted Members & Balances" titleVariant="titleMedium"
                titleStyle={{color: theme.colors.onSurface}}
                subtitleStyle={{color:theme.colors.onSurfaceVariant}}
              />
              <PaperCard.Content>
              {groupDetails?.members?.filter(m => m.status === 'accepted').map(member => {
                const balance = groupMemberBalances[member.uid] || 0;
                let balanceColor = balance === 0 ? theme.colors.onSurfaceVariant : balance > 0 ? (theme.colors.customSuccess || MD3Colors.green600) : theme.colors.error;
                return (
                  <View key={member.uid} style={styles.memberBalanceItem}>
                    <PaperText variant="bodyMedium">{usernamesMap[member.uid] || member.email} {member.uid === currentUserUid ? "(You)" : ""}</PaperText>
                    <PaperText variant="bodyMedium" style={{color: balanceColor, fontWeight:'500'}}>
                        {balance === 0 ? "Settled" : balance > 0 ? `Owed $${balance.toFixed(2)}` : `Owes $${Math.abs(balance.toFixed(2))}`}
                    </PaperText>
                  </View>
                );
              })}
              {(!groupDetails?.members || groupDetails.members.filter(m => m.status === 'accepted').length === 0) &&
                <PaperText style={styles.noItemsText}>No other accepted members.</PaperText>}
              </PaperCard.Content>
            </PaperCard>

            <PaperCard style={styles.chartCard} elevation={1}>
                <PaperCard.Title
                    title="Spending by Category"
                    titleVariant="titleMedium"
                    left={(props) => <MaterialCommunityIcons {...props} name="chart-pie" color={theme.colors.primary} />}
                    titleStyle={{color: theme.colors.onSurface}}
                />
                <PaperCard.Content>
                    {renderChartSection()}
                </PaperCard.Content>
            </PaperCard>

            <PaperText variant="titleLarge" style={[styles.sectionTitle, {color: theme.colors.onBackground}]}>Group Activity</PaperText>
          </>
        }
        data={combinedActivity}
        renderItem={renderActivityItem}
        keyExtractor={item => item.id + (item.type || 'expense')}
        style={styles.activityList}
        contentContainerStyle={{paddingBottom: 20}}
        ListEmptyComponent={<PaperText style={styles.noItemsText}>{loading || refreshing ? 'Loading activity...' : 'No activity in this group yet.'}</PaperText>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchData} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
      />
      <Portal>
        <Dialog visible={isSimplifyModalVisible} onDismiss={() => setIsSimplifyModalVisible(false)} style={{backgroundColor: theme.colors.surface}}>
          <Dialog.Title style={{color: theme.colors.onSurface}}>Simplified Group Debts</Dialog.Title>
          <Dialog.ScrollArea style={{maxHeight: 400, paddingHorizontal:0}}>
            <ScrollView>
            {isCalculatingSimplifiedDebts ? <PaperActivityIndicator animating={true} color={theme.colors.primary}/> :
              simplifiedTransactionsList.length === 0 ?
              <PaperText style={styles.noItemsText}>Everyone is settled up!</PaperText> : // Changed message slightly
              <FlatList
                data={simplifiedTransactionsList}
                keyExtractor={(item, index) => `txn-${index}`}
                renderItem={({item}) => (
                  <View style={styles.transactionItem}>
                    <PaperText variant="bodyMedium" style={{color: theme.colors.onSurface}}>
                      <PaperText style={{fontWeight: 'bold'}}>{usernamesMap[item.fromUid] || item.fromUid.substring(0,6)}</PaperText>
                      {' pays '}
                      <PaperText style={{fontWeight: 'bold'}}>{usernamesMap[item.toUid] || item.toUid.substring(0,6)}</PaperText>
                      <PaperText style={{fontWeight: 'bold', color: theme.colors.primary}}> ${item.amount.toFixed(2)}</PaperText>
                    </PaperText>
                  </View>
                )}
              />
            }
            </ScrollView>
            <PaperText style={[styles.disclaimerText, {color: theme.colors.onSurfaceVariant}]}>These are suggested payments. Record actual payments using 'Record Payment'.</PaperText>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <PaperButton onPress={() => setIsSimplifyModalVisible(false)} textColor={theme.colors.primary}>Close</PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, /* bg from theme */ },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', /* bg from theme */ },
  balanceContainer: { padding: 20, marginHorizontal:15, marginTop:15, marginBottom:5, borderRadius: 10, alignItems: 'center' /* bg, shadow from PaperCard */ },
  balanceSummaryText: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  balanceCalculatingText: { /* color from theme */ },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 15, paddingHorizontal:10 },
  actionButton: { flex: 0.48, },
  simplifyButton: { marginHorizontal:15, marginBottom:20, },
  membersContainer: { marginHorizontal:15, marginBottom:20, },
  sectionTitle: { marginHorizontal: 20, marginBottom: 15, marginTop:10, fontWeight:'bold'},
  memberBalanceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', paddingVertical: 10, borderBottomWidth:1, },
  memberEmail: { /* Replaced by PaperText variant */ },
  memberBalanceText: { fontWeight:'500'},
  activityList: { paddingHorizontal: 15 },
  activityItemCard: { marginBottom: 12, borderWidth:0 },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', marginBottom: 8 },
  recurringIcon: { marginRight: 8 },
  descriptionWithIcon: { flexShrink:1, maxWidth: '80%' },
  expenseDescription: { flexShrink:1 },
  expenseAmount: { fontWeight: 'bold' },
  expensePaidBy: { fontSize:13, marginTop:4, marginBottom: 2 },
  expenseSplit: { fontSize:13, fontStyle:'italic' },
  itemDate: { fontSize: 12, textAlign: 'right', marginTop: 8, opacity:0.7 },
  viewItemsText: { fontSize: 13, marginTop: 5, textAlign: 'right', fontWeight:'500' },
  settlementText: { /* Replaced by PaperText variant */ },
  userName: { fontWeight: 'bold', /* color from theme.colors.primary */ },
  settlementAmount: { fontWeight: 'bold', /* color from theme.colors.customSuccess */ },
  settlementNote: { fontSize: 14, marginTop: 5, fontStyle:'italic', /* color from theme.colors.onSurfaceVariant */ },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 15, /* color from theme.colors.onSurfaceVariant */ },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalTitle: { marginBottom: 20, textAlign: 'center'},
  transactionItem: { paddingVertical: 12, borderBottomWidth: 1, /* borderColor from theme.colors.outline */ },
  disclaimerText: {fontSize: 13, textAlign:'center', marginTop:15, fontStyle:'italic', /* color from theme.colors.onSurfaceVariant */},
  chartCard: { marginHorizontal: 15, marginTop: 10, marginBottom: 20, elevation:1 }, // elevation from PaperCard
  chartCardContent: { alignItems: 'center', padding: 10, },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 0, justifyContent:'flex-start' }, // Adjusted for Card.Title
  titleIcon: { marginRight: 10, }, // Used with Card.Title left prop
  chartTitle: { fontWeight: '600', /* color from theme, use PaperText variant */ },
  loadingContainer: { height: 230, justifyContent: 'center', alignItems: 'center', },
  loadingText: { marginTop: 10, fontSize: 15, /* color from theme.colors.onSurfaceVariant */ },
});

export default GroupDetailScreen;
