import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { firebase } from '../../firebaseConfig';
import {
    Text as PaperText,
    List as PaperList,
    Avatar as PaperAvatar,
    Button as PaperButton,
    ActivityIndicator as PaperActivityIndicator,
    useTheme
} from 'react-native-paper';
import { calculateNetBalance } from '../../utils/balanceUtils'; // Ensure path is correct
import { formatDistanceToNowStrict, parseISO } from 'date-fns'; // For date formatting

function GroupItemDescription({ item, theme }) {
  let balanceColor = theme.colors.onSurfaceVariant;
  if (item.userNetBalance < -0.01) balanceColor = theme.colors.error;
  else if (item.userNetBalance > 0.01) balanceColor = theme.colors.customSuccess || theme.colors.tertiary;

  return (
    <View>
      <PaperText variant="bodySmall" style={{ color: balanceColor, fontWeight: item.userNetBalance !== 0 ? 'bold' : 'normal' }}>
        Your balance: {item.userNetBalance > 0 ? `Owed $${item.userNetBalance.toFixed(2)}` : item.userNetBalance < 0 ? `You owe $${Math.abs(item.userNetBalance).toFixed(2)}` : "Settled"}
      </PaperText>
      <PaperText variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
        {item.memberCount} member(s) {item.lastActivity ? ` • Last active: ${item.lastActivity}` : ''}
      </PaperText>
    </View>
  );
}

function GroupsListScreen({ navigation }) {
  const theme = useTheme();
  const [enrichedGroups, setEnrichedGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(null);


  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
      setCurrentUserEmail(user.email); // Needed for the members query
    } else {
      Alert.alert("Authentication Error", "No user logged in.");
      navigation.navigate('Login');
    }
  }, [navigation]);

  const fetchData = useCallback(async () => {
    if (!currentUserUid || !currentUserEmail) return;
    setRefreshing(true);
    setIsLoading(true); // Ensure loading is true at the start of fetch

    try {
      const groupsSnapshot = await firebase.firestore().collection('groups')
        .where('members', 'array-contains', { uid: currentUserUid, email: currentUserEmail, status: 'accepted' })
        .get(); // No server-side sort needed here, will sort client-side after enrichment

      const groupDataPromises = groupsSnapshot.docs.map(async (doc) => {
        const group = { id: doc.id, ...doc.data() };

        const expensesSnapshot = await firebase.firestore().collection('expenses')
          .where('groupId', '==', group.id).get();
        const expenses = expensesSnapshot.docs.map(d => ({id: d.id, ...d.data()}));

        const settlementsSnapshot = await firebase.firestore().collection('settlements')
          .where('groupId', '==', group.id).get();
        const settlements = settlementsSnapshot.docs.map(d => ({id: d.id, ...d.data()}));

        const userNetBalance = calculateNetBalance(expenses, settlements, currentUserUid);
        const memberCount = group.members.filter(m => m.status === 'accepted').length;

        let lastActivityTimestamp = null;
        const lastExpense = expenses.length > 0 ? expenses.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate())[0] : null;
        const lastSettlement = settlements.length > 0 ? settlements.sort((a,b) => b.createdAt.toDate() - a.createdAt.toDate())[0] : null;

        if (lastExpense) lastActivityTimestamp = lastExpense.createdAt.toDate();
        if (lastSettlement && (!lastActivityTimestamp || lastSettlement.createdAt.toDate() > lastActivityTimestamp)) {
          lastActivityTimestamp = lastSettlement.createdAt.toDate();
        }

        const lastActivity = lastActivityTimestamp ? formatDistanceToNowStrict(lastActivityTimestamp, { addSuffix: true }) : 'N/A';

        return {
          id: group.id,
          name: group.name,
          userNetBalance: parseFloat(userNetBalance.toFixed(2)),
          memberCount,
          lastActivity,
          lastActivityDateObj: lastActivityTimestamp, // For sorting
          originalMembers: group.members,
        };
      });

      let processedGroups = await Promise.all(groupDataPromises);

      // Sort groups: non-zero balance first (larger absolute), then by most recent activity
      processedGroups.sort((a, b) => {
        const aHasBalance = Math.abs(a.userNetBalance) > 0.01;
        const bHasBalance = Math.abs(b.userNetBalance) > 0.01;
        if (aHasBalance && !bHasBalance) return -1;
        if (!aHasBalance && bHasBalance) return 1;
        if (aHasBalance && bHasBalance) {
          if (Math.abs(a.userNetBalance) > Math.abs(b.userNetBalance)) return -1;
          if (Math.abs(a.userNetBalance) < Math.abs(b.userNetBalance)) return 1;
        }
        return (b.lastActivityDateObj || 0) - (a.lastActivityDateObj || 0);
      });

      setEnrichedGroups(processedGroups);
    } catch (error) {
      console.error("Error fetching enriched groups: ", error);
      Alert.alert("Error", "Could not fetch groups data.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [currentUserUid, currentUserEmail]);

  useEffect(() => {
    if (currentUserUid && currentUserEmail) { // Ensure both are available
      fetchData();
    }
  }, [currentUserUid, currentUserEmail, fetchData]); // Add currentUserEmail to dependencies

  const onRefresh = () => fetchData();

  const renderItem = ({ item }) => (
    <PaperList.Item
      title={item.name}
      titleStyle={[styles.groupName, {color: theme.colors.onSurface}]}
      description={() => <GroupItemDescription item={item} theme={theme} />}
      descriptionNumberOfLines={2}
      left={(props) => <PaperAvatar.Icon {...props} icon="account-group" style={{backgroundColor: theme.colors.surfaceVariant}} color={theme.colors.primary} />}
      onPress={() => navigation.navigate('GroupDetailScreen', {
          groupId: item.id,
          groupName: item.name,
          // groupMembers: item.originalMembers // Pass members if GroupDetailScreen can use them
      })}
      style={[styles.listItem, {backgroundColor: theme.colors.surface, borderRadius: theme.roundness}]}
      rippleColor={theme.colors.primaryContainer}
    />
  );

  if (isLoading && !refreshing && enrichedGroups.length === 0) {
    return <View style={[styles.centered, {backgroundColor: theme.colors.background}]}><PaperActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      {enrichedGroups.length === 0 && !isLoading && !refreshing ? (
        <View style={[styles.centered, {padding: 20}]}>
          <PaperAvatar.Icon icon="account-group-outline" size={80} style={{backgroundColor: 'transparent', marginBottom:20}} color={theme.colors.onSurfaceDisabled}/>
          <PaperText variant="titleMedium" style={{textAlign:'center', color: theme.colors.onSurfaceVariant}}>No groups yet.</PaperText>
          <PaperText variant="bodySmall" style={{textAlign:'center', marginBottom:20, color: theme.colors.onSurfaceVariant}}>Create a group to start sharing expenses.</PaperText>
          <PaperButton
            mode="contained"
            onPress={() => navigation.navigate('CreateGroupScreen')}
            icon="plus-circle-outline"
            style={{marginTop: 16, width:'80%', paddingVertical: 5}}
            labelStyle={{fontSize:16}}
          >
            Create Your First Group
          </PaperButton>
        </View>
      ) : (
        <FlatList
          data={enrichedGroups}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.list}
          contentContainerStyle={{padding:10, paddingBottom: 80}} // Padding for FAB
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary}/>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  list: { flex: 1 },
  listItem: {
    marginBottom: 10,
    elevation: 2, // For Paper like card shadow
    shadowColor: '#000', // Basic shadow for iOS
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  groupName: {
    fontSize: 18, // From PaperList.Item titleStyle
    fontWeight: '500',
  },
  // Styles for GroupItemDescription are implicitly handled by PaperText variants and inline styles
});

export default GroupsListScreen;
