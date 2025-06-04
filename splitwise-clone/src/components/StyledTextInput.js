import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

import { useState } from 'react'; // Moved to top

const COLORS = {
  cardBackground: '#ffffff',
  text: '#212529',
  placeholder: '#6c757d',
  border: '#ced4da',
  primary: '#007bff', // For focus border color
};

const StyledTextInput = (props) => {
  const [isFocused, setIsFocused] = useState(false); // Optional: for focus styling

  return (
    <TextInput
      {...props}
      style={[
        styles.input,
        isFocused && styles.inputFocused, // Apply focus style
        props.style, // Allow custom styles to be passed
      ]}
      placeholderTextColor={COLORS.placeholder}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.cardBackground,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginBottom: 15, // Consistent margin
    borderRadius: 8,
    fontSize: 16,
    width: '100%', // Default to full width
  },
  inputFocused: {
    borderColor: COLORS.primary, // Highlight border on focus
    // Example: add a subtle shadow or thicker border
    // shadowColor: COLORS.primary,
    // shadowOffset: { width: 0, height: 0 },
    // shadowOpacity: 0.25,
    // shadowRadius: 3.84,
    // elevation: 5,
  },
});

export default StyledTextInput;
