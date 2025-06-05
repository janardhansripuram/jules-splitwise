import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, RefreshControl, Modal, Dimensions } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { fetchUsernames } from '../utils/userUtils';
import StyledButton from '../components/StyledButton';
import { calculateNetBalance, calculateUserShareInExpense, calculateAllMemberBalances } from '../utils/balanceUtils';
import { simplifyDebts } from '../utils/debtUtils';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PieChart } from 'react-native-chart-kit';
import { getCategoryFromDescription, CATEGORY_COLORS } from '../../utils/categoryUtils'; // Adjust path as necessary

const COLORS = { /* ... (palette as before) ... */
  background: '#f8f9fa', cardBackground: '#ffffff', text: '#212529', textSecondary: '#6c757d',
  primary: '#007bff', accentPositive: '#28a745', accentNegative: '#dc3545',
  border: '#dee2e6', subtleBorder: '#e9ecef', expenseItemBg: '#ffffff', settlementItemBg: '#e6f7ff',
};

function GroupDetailScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;

  const [groupExpenses, setGroupExpenses] = useState([]);
  const [groupSettlements, setGroupSettlements] = useState([]);
  const [groupDetails, setGroupDetails] = useState(null); // Contains { ..., members: [{uid, email, name (added by fetchData)}]}
  const [usernamesMap, setUsernamesMap] = useState({}); // Still useful for quick lookups outside groupDetails context
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balances, setBalances] = useState({ netBalance: 0, settled: true });
  const [groupMemberBalances, setGroupMemberBalances] = useState({});
  const [currentUserUid, setCurrentUserUid] = useState(null);

  // Chart State
  const [pieChartData, setPieChartData] = useState([]);
  const [isLoadingChart, setIsLoadingChart] = useState(true);

  // Simplify Debts Modal State
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
    setLoading(true); // Ensure loading is true at start of fetch

    const uidsToFetch = new Set();
    try {
      const groupDoc = await firebase.firestore().collection('groups').doc(groupId).get();
      if (!groupDoc.exists) {
        Alert.alert("Error", "Group not found."); navigation.goBack(); return;
      }
      const currentGroupData = groupDoc.data();
      // Fetch usernames for members first
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
        setUsernamesMap(prev => ({...prev, ...namesMap})); // Merge with any existing from group members
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

  // Recalculate balances whenever relevant data changes
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

  }, [groupExpenses, groupSettlements, groupDetails, currentUserUid, loading, refreshing]); // Added groupDetails

  // Prepare Pie Chart Data
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
          name: category,
          population: parseFloat(categorySpending[category].toFixed(2)),
          color: CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'],
          legendFontColor: '#555',
          legendFontSize: 14,
        }));
      setPieChartData(chartData);
      setIsLoadingChart(false);
    } else {
      setPieChartData([]);
      setIsLoadingChart(false);
    }
  }, [groupExpenses]);


  const handleSimplifyDebts = () => {
    if (!groupDetails || !groupDetails.members || Object.keys(groupMemberBalances).length === 0) {
      Alert.alert("No Balances", "No member balances calculated yet to simplify.");
      return;
    }
    setIsCalculatingSimplifiedDebts(true);
    // Filter balances for accepted members only, as simplifyDebts doesn't know member status
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


  const renderExpenseItem = ({ item }) => { /* ... (no change from previous) ... */
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
            {item.recurringExpenseId && (
              <MaterialCommunityIcons name="update" size={16} color={COLORS.textSecondary} style={styles.recurringIcon} />
            )}
            <Text style={[styles.expenseDescription, item.recurringExpenseId && styles.descriptionWithIcon]}>{item.description}</Text>
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
  const renderSettlementItem = ({ item }) => { /* ... (no change from previous) ... */
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
  const renderBalanceSummary = () => { /* ... (no change from previous, uses currentUserNetBalance now) ... */
    let balanceText = "Calculating balance...";
    let balanceStyle = styles.balanceCalculatingText;

    if (!loading && !refreshing) { // Use currentUserNetBalance
        if (currentUserNetBalance.settled) {
            balanceText = "You are settled up in this group!";
            balanceStyle = styles.settledText;
        } else if (currentUserNetBalance.netBalance > 0) {
            balanceText = `Overall, you are owed: $${currentUserNetBalance.netBalance.toFixed(2)}`;
            balanceStyle = styles.owedToMeText;
        } else {
            balanceText = `Overall, you owe: $${Math.abs(currentUserNetBalance.netBalance).toFixed(2)}`;
            balanceStyle = styles.youOweText;
        }
    }
    return <Text style={[styles.balanceSummaryText, balanceStyle]}>{balanceText}</Text>;
  };

  if (loading && !refreshing && !groupDetails) { // Adjusted initial loading condition
    return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /><Text>Loading group details...</Text></View>;
  }

  const combinedActivity = [...groupExpenses, ...groupSettlements]
    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
  const renderActivityItem = ({ item }) => {
    if (item.type === 'settlement') { return renderSettlementItem({ item }); }
    return renderExpenseItem({ item });
  };

  const screenWidth = Dimensions.get('window').width;

  const renderChartSection = () => {
    if (isLoadingChart) {
      return (
        <View style={[styles.chartCardContent, styles.loadingContainer]}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading Chart...</Text>
        </View>
      );
    }
    if (pieChartData.length === 0) {
      return (
        <View style={[styles.chartCardContent, styles.loadingContainer]}>
           <MaterialCommunityIcons name="chart-arc-variant" size={48} color={COLORS.textSecondary} />
          <Text style={styles.noDataText}>No spending data to display chart.</Text>
        </View>
      );
    }
    return (
      <View style={styles.chartCardContent}>
        <PieChart
          data={pieChartData}
          width={screenWidth - (styles.chartCard.marginHorizontal * 2) - (styles.chartCardContent.padding * 2) -10} // Adjusted width calculation
          height={230}
          chartConfig={{
            backgroundColor: COLORS.cardBackground, // Chart background, not card itself
            backgroundGradientFrom: COLORS.cardBackground,
            backgroundGradientTo: COLORS.cardBackground,
            decimalPlaces: 2,
            color: (opacity = 1) => `rgba(50, 50, 50, ${opacity})`, // Darker text for chart labels if needed
            labelColor: (opacity = 1) => `rgba(50, 50, 50, ${opacity})`, // Darker text for legend
            style: { borderRadius: 10 }, // Style for chart area itself if any
            propsForLabels: { // Style for the percentage labels on slices
                fontSize: 11,
                // fill: '#fff' // Example if slices are dark
            },
          }}
          accessor={"population"}
          backgroundColor={"transparent"} // Pie chart background itself transparent
          paddingLeft={"10"} // Fine-tune for centering based on your data/labels
          absolute // Show absolute values if desired
          // hasLegend={true} // default is true
        />
      </View>
    );
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
            <StyledButton title="Simplify Group Debts" onPress={handleSimplifyDebts} type="outline" style={styles.simplifyButton} disabled={isCalculatingSimplifiedDebts || loading || Object.keys(groupMemberBalances).length === 0}/>

            <View style={styles.membersContainer}>
              <Text style={styles.sectionTitle}>Accepted Members & Balances</Text>
              {groupDetails?.members?.filter(m => m.status === 'accepted').map(member => {
                const balance = groupMemberBalances[member.uid] || 0;
                let balanceColor = balance === 0 ? COLORS.textSecondary : balance > 0 ? COLORS.accentPositive : COLORS.accentNegative;
                return (
                  <View key={member.uid} style={styles.memberBalanceItem}>
                    <Text style={styles.memberEmail}>{usernamesMap[member.uid] || member.email} {member.uid === currentUserUid ? "(You)" : ""}</Text>
                    <Text style={{...styles.memberBalanceText, color: balanceColor}}>
                        {balance === 0 ? "Settled" : balance > 0 ? `Owed $${balance.toFixed(2)}` : `Owes $${Math.abs(balance).toFixed(2)}`}
                    </Text>
                  </View>
                );
              })}
              {(!groupDetails?.members || groupDetails.members.filter(m => m.status === 'accepted').length === 0) &&
                <Text style={styles.noItemsText}>No other accepted members.</Text>}
            </View>

            {/* Pie Chart Section - Using custom card style */}
            <View style={styles.chartCard}>
                <View style={styles.titleRow}>
                    <MaterialCommunityIcons name="chart-pie" size={24} color={COLORS.primary} style={styles.titleIcon} />
                    <Text style={styles.chartTitle}>Spending by Category</Text>
                </View>
                {renderChartSection()}
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

      <Modal visible={isSimplifyModalVisible} onRequestClose={() => setIsSimplifyModalVisible(false)} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Simplified Group Debts</Text>
            {isCalculatingSimplifiedDebts ? <ActivityIndicator/> :
              simplifiedTransactionsList.length === 0 ?
              <Text style={styles.noItemsText}>Everyone is settled up, or no simplification needed!</Text> :
              <FlatList
                data={simplifiedTransactionsList}
                keyExtractor={(item, index) => `txn-${index}`}
                renderItem={({item}) => (
                  <View style={styles.transactionItem}>
                    <Text style={styles.transactionText}>
                      <Text style={styles.userName}>{usernamesMap[item.fromUid] || item.fromUid.substring(0,6)}</Text>
                      {' should pay '}
                      <Text style={styles.userName}>{usernamesMap[item.toUid] || item.toUid.substring(0,6)}</Text>
                      <Text style={styles.transactionAmount}> ${item.amount.toFixed(2)}</Text>
                    </Text>
                  </View>
                )}
              />
            }
            <Text style={styles.disclaimerText}>These are suggested payments. Please record actual payments made using the 'Record Payment' feature.</Text>
            <StyledButton title="Close" onPress={() => setIsSimplifyModalVisible(false)} type="primary" style={{marginTop:15}}/>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... (Existing styles)
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  balanceContainer: { padding: 20, backgroundColor: COLORS.cardBackground, margin:15, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2, }, shadowOpacity: 0.05, shadowRadius: 3.84, elevation: 3, alignItems: 'center' },
  balanceSummaryText: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  balanceCalculatingText: { color: COLORS.textSecondary },
  settledText: { color: COLORS.accentPositive },
  owedToMeText: { color: COLORS.accentPositive },
  youOweText: { color: COLORS.accentNegative },
  actionButtonsContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10, paddingHorizontal:10 },
  actionButton: { flex: 0.48 },
  simplifyButton: { marginHorizontal:15, marginBottom:20, backgroundColor: COLORS.cardBackground, borderWidth:1, borderColor:COLORS.primary},
  membersContainer: { padding: 15, backgroundColor: COLORS.cardBackground, marginHorizontal:15, marginBottom:20, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1, }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 12, paddingHorizontal: 20 },
  memberEmail: { fontSize: 15, color: COLORS.textSecondary, paddingVertical: 5 }, // For member list without balance
  memberBalanceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', paddingVertical: 8, borderBottomWidth:1, borderBottomColor: COLORS.subtleBorder},
  memberBalanceText: { fontSize: 14, fontWeight:'500'},

  activityList: { paddingHorizontal: 15 },
  expenseItem: { backgroundColor: COLORS.expenseItemBg, padding: 15, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  expenseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems:'center', marginBottom: 8 },
  recurringIcon: { marginRight: 6 },
  descriptionWithIcon: { flexShrink:1, maxWidth: '80%' },
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
  settlementNote: { fontSize: 14, color: COLORS.textSecondary, marginTop: 5, fontStyle:'italic' },
  noItemsText: { textAlign: 'center', marginVertical: 20, fontSize: 15, color: COLORS.textSecondary },
  // Modal Styles for Simplify Debts
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContent: { backgroundColor: COLORS.cardBackground, padding: 25, borderRadius: 10, width: '90%', maxHeight: '85%', shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: COLORS.text },
  transactionItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.subtleBorder },
  transactionText: { fontSize: 16, color: COLORS.text },
  transactionAmount: { fontWeight: 'bold', color: COLORS.primary },
  disclaimerText: {fontSize: 13, color: COLORS.textSecondary, textAlign:'center', marginTop:15, fontStyle:'italic'},
});

export default GroupDetailScreen;
