import React, { useState } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';
import { Button as PaperButton, TextInput as PaperTextInput, Text as PaperText, useTheme, ActivityIndicator as PaperActivityIndicator } from 'react-native-paper';

function SignUpScreen({ navigation }) {
  const theme = useTheme();
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
          // console.log(`Updated ${querySnapshot.size} pending_signup invitations for ${normalizedEmail}`);
        }
        // Navigation is handled by onAuthStateChanged in App.js
      }
    } catch (error) {
      Alert.alert("Sign Up Failed", error.message);
      // console.error("Sign up error: ", error);
    }
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <PaperText variant="headlineLarge" style={[styles.title, { color: theme.colors.primary }]}>Create Account</PaperText>
      <PaperTextInput
        label="Full Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        textContentType="name"
        disabled={loading}
        style={styles.input}
        mode="outlined"
      />
      <PaperTextInput
        label="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        disabled={loading}
        style={styles.input}
        mode="outlined"
      />
      <PaperTextInput
        label="Password"
        placeholder="Min. 6 characters"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        disabled={loading}
        style={styles.input}
        mode="outlined"
      />
      {loading ? (
        <PaperActivityIndicator animating={true} color={theme.colors.primary} size="large" style={styles.loader} />
      ) : (
        <PaperButton
          mode="contained"
          onPress={handleSignUp}
          disabled={loading}
          style={styles.button}
          labelStyle={styles.buttonLabel}
        >
          Sign Up
        </PaperButton>
      )}
      <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={loading} style={styles.switchButton}>
        <PaperText variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Already have an account? <PaperText variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Login</PaperText>
        </PaperText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
  },
  title: {
    textAlign: 'center',
    marginBottom: 35,
  },
  input: {
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
  },
  loader: {
    marginTop: 20,
    marginBottom: 20,
  },
  switchButton: {
    marginTop: 30,
    alignItems: 'center',
  },
});

export default SignUpScreen;
