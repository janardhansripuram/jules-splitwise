import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, RefreshControl, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledButton from '../components/StyledButton';
import { format, parseISO } from 'date-fns'; // For formatting dates

const COLORS = { /* Using a simplified palette for brevity, ideally import from global styles */
  background: '#f8f9fa', cardBackground: '#ffffff', text: '#212529',
  textSecondary: '#6c757d', primary: '#007bff', border: '#dee2e6',
  active: '#28a745', paused: '#ffc107',
};

function RecurringExpensesListScreen({ navigation }) {
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserUid, setCurrentUserUid] = useState(null);

  useEffect(() => {
    const user = firebase.auth().currentUser;
    if (user) {
      setCurrentUserUid(user.uid);
    } else {
      navigation.navigate('Login');
    }
  }, [navigation]);

  const fetchData = useCallback(async () => {
    if (!currentUserUid) return;
    setRefreshing(true);
    try {
      const unsubscribe = firebase.firestore().collection('recurringExpenses')
        .where('userId', '==', currentUserUid)
        .orderBy('nextDueDate', 'asc') // Show upcoming ones first
        .onSnapshot(querySnapshot => {
          const expenses = [];
          querySnapshot.forEach(doc => {
            expenses.push({ id: doc.id, ...doc.data() });
          });
          setRecurringExpenses(expenses);
          setLoading(false);
          setRefreshing(false);
        }, (error) => {
          console.error("Error fetching recurring expenses:", error);
          Alert.alert("Error", "Could not fetch recurring expenses.");
          setLoading(false);
          setRefreshing(false);
        });
      return unsubscribe; // Return unsubscribe function for cleanup
    } catch (error) {
      console.error("Error setting up recurring expenses listener:", error);
      Alert.alert("Error", "Could not set up listener for recurring expenses.");
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserUid]);

  useEffect(() => {
    let unsubscribe;
    if (currentUserUid) {
      fetchData().then(unsub => unsubscribe = unsub);
    }
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUserUid, fetchData]);

  const onRefresh = () => fetchData();

  const renderItem = ({ item }) => {
    let nextDueDateFormatted = 'N/A';
    if (item.nextDueDate && item.nextDueDate.toDate) { // Check if it's a Firestore Timestamp
      nextDueDateFormatted = format(item.nextDueDate.toDate(), 'MMM dd, yyyy');
    } else if (item.nextDueDate) { // Handle if it's already a string (e.g., from older data)
        try {
            nextDueDateFormatted = format(parseISO(item.nextDueDate), 'MMM dd, yyyy');
        } catch (e) { /* ignore, keep N/A */ }
    }

    return (
      <TouchableOpacity onPress={() => navigation.navigate('AddEditRecurringExpense', { recurringExpenseId: item.id })}>
        <View style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemDescription}>{item.description}</Text>
            <Text style={[styles.itemStatus, item.isActive ? styles.activeStatus : styles.pausedStatus]}>
              {item.isActive ? "Active" : "Paused"}
            </Text>
          </View>
          <Text style={styles.itemAmount}>${item.amount ? item.amount.toFixed(2) : '0.00'}</Text>
          <Text style={styles.itemFrequency}>Frequency: {item.frequency}</Text>
          <Text style={styles.itemNextDate}>Next Due: {nextDueDateFormatted}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && recurringExpenses.length === 0) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <StyledButton
        title="Create New Recurring Expense"
        onPress={() => navigation.navigate('AddEditRecurringExpense')}
        type="primary"
        style={styles.createButton}
      />
      {recurringExpenses.length === 0 && !loading ? (
        <View style={styles.centered}>
          <Text style={styles.noItemsText}>No recurring expenses found. Create one!</Text>
        </View>
      ) : (
        <FlatList
          data={recurringExpenses}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding:10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  createButton: { marginHorizontal: 5, marginBottom: 15, },
  list: { /* No specific styles needed yet */ },
  itemCard: {
    backgroundColor: COLORS.cardBackground,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5},
  itemDescription: { fontSize: 18, fontWeight: '500', color: COLORS.text, flexShrink: 1 },
  itemStatus: { fontSize: 13, fontWeight: 'bold', paddingVertical:3, paddingHorizontal:6, borderRadius:4, overflow:'hidden'},
  activeStatus: { backgroundColor: COLORS.active+'30', color: COLORS.active }, // Greenish
  pausedStatus: { backgroundColor: COLORS.paused+'30', color: COLORS.paused }, // yellowish
  itemAmount: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary, marginBottom: 5 },
  itemFrequency: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 3 },
  itemNextDate: { fontSize: 14, color: COLORS.textSecondary },
  noItemsText: { fontSize: 16, color: COLORS.textSecondary, textAlign:'center' },
});

export default RecurringExpensesListScreen;
