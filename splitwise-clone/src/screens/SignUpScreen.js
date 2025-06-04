import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledButton from '../components/StyledButton';
import StyledTextInput from '../components/StyledTextInput';

const COLORS = {
  background: '#f8f9fa',
  text: '#212529',
  primary: '#007bff',
  secondaryText: '#6c757d',
};

function SignUpScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!name.trim() || !normalizedEmail || !password.trim()) {
      Alert.alert("Input Error", "Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password Too Short", "Password must be at least 6 characters long.");
      return;
    }
    setLoading(true);
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(normalizedEmail, password);
      const user = userCredential.user;

      if (user) {
        const userDocData = {
          name: name.trim(),
          email: normalizedEmail,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        await firebase.firestore().collection('users').doc(user.uid).set(userDocData);

        const groupsRef = firebase.firestore().collection('groups');
        // Query for groups where this email was invited before they had an account
        const querySnapshot = await groupsRef.where('members', 'array-contains', { email: normalizedEmail, status: 'pending_signup' }).get();

        if (!querySnapshot.empty) {
          const batch = firebase.firestore().batch();
          querySnapshot.forEach(groupDoc => {
            const groupData = groupDoc.data();
            const updatedMembers = groupData.members.map(member =>
              (member.email === normalizedEmail && member.status === 'pending_signup')
                ? { ...member, uid: user.uid, status: 'pending' }
                : member
            );
            batch.update(groupDoc.ref, { members: updatedMembers });
          });
          await batch.commit();
          console.log(`Updated ${querySnapshot.size} pending_signup invitations for ${normalizedEmail}`);
        }
        // Navigation to the main app will be handled by onAuthStateChanged listener in App.js
      }
    } catch (error) {
      Alert.alert("Sign Up Failed", error.message);
      console.error("Sign up error: ", error);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <StyledTextInput
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
        disabled={loading}
      />
      <StyledTextInput
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        disabled={loading}
      />
      <StyledTextInput
        placeholder="Password (min. 6 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword" // Helps with password generation suggestions
        disabled={loading}
      />
      <StyledButton
        title={loading ? "Creating Account..." : "Sign Up"}
        onPress={handleSignUp}
        type="primary"
        disabled={loading}
        style={{width: '100%', marginTop: 10}}
      />
      <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading} style={styles.switchButton}>
        <Text style={styles.switchText}>Already have an account? <Text style={styles.loginLink}>Login</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 35,
  },
  switchButton: {
    marginTop: 25,
    alignItems: 'center',
  },
  switchText: {
    fontSize: 16,
    color: COLORS.secondaryText,
  },
  loginLink: {
    color: COLORS.primary,
    fontWeight: 'bold',
  }
});

export default SignUpScreen;
