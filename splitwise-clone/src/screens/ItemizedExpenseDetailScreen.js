import React, { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView } from 'react-native';

function ItemizedExpenseDetailScreen({ route, navigation }) {
  const { expense, usernamesMap } = route.params;

  useEffect(() => {
    navigation.setOptions({ title: `Details for: ${expense.description}` });
  }, [navigation, expense]);

  const renderItemDetail = ({ item: expenseItem }) => (
    <View style={styles.itemDetailRow}>
      <Text style={styles.itemName}>{expenseItem.itemName} (${expenseItem.itemAmount.toFixed(2)})</Text>
      <Text style={styles.assignedTitle}>Assigned to:</Text>
      {expenseItem.assignedTo.map(uid => (
        <Text key={uid} style={styles.assignedMember}>
          - {usernamesMap[uid] || `User ${uid.substring(0,6)}...`} (Share: ${(expenseItem.itemAmount / expenseItem.assignedTo.length).toFixed(2)})
        </Text>
      ))}
    </View>
  );

  const paidByUsername = usernamesMap[expense.paidByUid] || `User ${expense.paidByUid.substring(0,6)}...`;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Expense: {expense.description}</Text>
        <Text style={styles.totalAmount}>Total Amount: ${expense.amount.toFixed(2)}</Text>
        <Text style={styles.paidBy}>Paid by: {paidByUsername}</Text>
        {expense.createdAt?.toDate && (
          <Text style={styles.date}>Date: {expense.createdAt.toDate().toLocaleDateString()}</Text>
        )}
      </View>

      <Text style={styles.itemsHeader}>Items:</Text>
      <FlatList
        data={expense.items}
        renderItem={renderItemDetail}
        keyExtractor={(item, index) => `${item.itemName}-${index}`} // Items might not have unique IDs from DB
        style={styles.list}
        ListEmptyComponent={<Text style={styles.noItemsText}>No items found for this expense.</Text>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#f9f9f9',
  },
  headerContainer: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '500',
    color: '#007bff',
    marginBottom: 5,
  },
  paidBy: {
    fontSize: 16,
    color: '#555',
    marginBottom: 5,
  },
  date: {
    fontSize: 14,
    color: 'gray',
  },
  itemsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  list: {
    // Styles for the list itself if needed
  },
  itemDetailRow: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#444',
    marginBottom: 5,
  },
  assignedTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 5,
  },
  assignedMember: {
    fontSize: 14,
    color: '#777',
    marginLeft: 10,
  },
  noItemsText: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 15,
    color: 'gray',
  },
});

export default ItemizedExpenseDetailScreen;
