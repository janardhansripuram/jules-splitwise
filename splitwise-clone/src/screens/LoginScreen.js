import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { firebase } from '../../firebaseConfig';
import StyledButton from '../components/StyledButton'; // Import StyledButton
import StyledTextInput from '../components/StyledTextInput'; // Import StyledTextInput

const COLORS = { // Defined for this screen, or import from a global styles file
  background: '#f8f9fa',
  text: '#212529',
  primary: '#007bff',
  secondaryText: '#6c757d',
};

function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Input Error", "Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      await firebase.auth().signInWithEmailAndPassword(email.trim(), password);
      // Navigation is handled by onAuthStateChanged
    } catch (error) {
      Alert.alert("Login Failed", error.message);
      console.error("Login error: ", error);
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back!</Text>
      <StyledTextInput
        placeholder="Email Address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress" // Helps with autofill
        disabled={loading}
      />
      <StyledTextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password" // Helps with autofill
        disabled={loading}
      />
      <StyledButton
        title={loading ? "Logging in..." : "Login"}
        onPress={handleLogin}
        type="primary"
        disabled={loading}
        style={{width: '100%', marginTop: 10}} // Make button full width
      />
      <TouchableOpacity onPress={() => navigation.navigate('SignUp')} disabled={loading} style={styles.switchButton}>
        <Text style={styles.switchText}>Don't have an account? <Text style={styles.signUpLink}>Sign Up</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25, // Increased padding
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 32, // Larger title
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 35, // More space after title
  },
  switchButton: {
    marginTop: 25, // More space before switch text
    alignItems: 'center',
  },
  switchText: {
    fontSize: 16,
    color: COLORS.secondaryText,
  },
  signUpLink: {
    color: COLORS.primary,
    fontWeight: 'bold',
  }
});

export default LoginScreen;
