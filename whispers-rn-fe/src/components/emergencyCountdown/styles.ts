import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: '80%',
        backgroundColor: '#ff3b30',
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 30,
        textAlign: 'center',
    },
    countdown: {
        fontSize: 120,
        fontWeight: 'bold',
        color: 'white',
        marginVertical: 20,
    },
    message: {
        fontSize: 18,
        color: 'white',
        marginBottom: 30,
        textAlign: 'center',
    },
    cancelButton: {
        backgroundColor: 'white',
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 10,
    },
    cancelButtonText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ff3b30',
    },
});
