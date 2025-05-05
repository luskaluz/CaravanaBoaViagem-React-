import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import styles from './Login.module.css';
import LoadingSpinner from '../LoadingSpinner/LoadingSpinner'; // <<< Importar

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false); // <<< Renomeado para clareza
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!ADMIN_EMAIL) { console.error("ATENÇÃO: REACT_APP_ADMIN_EMAIL não definida!"); }
    }, []);

    const handleLogin = async (event) => {
        event.preventDefault();
        setError(''); setSuccessMessage('');
        setIsLoggingIn(true); // <<< Usa estado específico

        console.log(`Tentando login com: ${email}`);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("Firebase Auth sucesso. User email:", user.email);

            if (ADMIN_EMAIL && user.email.trim() === ADMIN_EMAIL.trim()) {
                console.log("É Admin. Redirecionando...");
                navigate('/admin-dashboard'); return;
            }

            console.log("Não é Admin. Verificando usuário comum...");
            try {
                await api.getDadosUsuario(user.uid);
                console.log("É usuário comum. Redirecionando...");
                navigate('/dashboard'); return;
            } catch (userError) {
                if (userError.status !== 404) { throw userError; } // Relança erro inesperado
                console.log("Não usuário comum. Verificando funcionário...");
            }

            try {
                await api.getFuncionarioById(user.uid);
                console.log("É funcionário. Redirecionando...");
                navigate('/funcionario-dashboard'); return;
            } catch (funcionarioError) {
                if (funcionarioError.status !== 404 ) { throw funcionarioError; } // Relança erro inesperado
                console.warn("Usuário autenticado mas sem registro:", user.uid, user.email);
                setError("Conta autenticada, mas sem acesso registrado.");
                await auth.signOut();
            }
        } catch (authError) {
            console.error("Erro no processo de login:", authError);
            if(authError.code === 'auth/invalid-credential' || authError.code === 'auth/invalid-login-credentials' || authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password'){ setError("Email ou senha inválidos."); }
            else if (authError.message.includes("verificar seus dados")) { setError(authError.message); } // Mostra erros das chamadas API
            else { setError("Falha na autenticação. Verifique conexão."); }
        } finally {
            setIsLoggingIn(false); // <<< Usa estado específico
        }
    };

    const handlePasswordReset = async () => {
        if (!email) { setError("Digite seu email para redefinir a senha."); return; }
        setError(''); setSuccessMessage('');
        setIsResettingPassword(true);
        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMessage(`Email de redefinição enviado para ${email}.`);
        } catch (resetError) {
            console.error("Erro no reset:", resetError.code, resetError.message);
            if (resetError.code === 'auth/user-not-found' || resetError.code === 'auth/invalid-email') { setError("Email não encontrado ou inválido."); }
            else { setError("Erro ao enviar email de redefinição."); }
        } finally { setIsResettingPassword(false); }
    };

    return (
        <div className={styles.container}>
            <form className={styles.form} onSubmit={handleLogin}>
                <h2 className={styles.title}>Login</h2>
                <label className={styles.label}> Email:
                    <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoggingIn || isResettingPassword} placeholder="seuemail@exemplo.com" />
                </label>
                <label className={styles.label}> Senha:
                    <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoggingIn || isResettingPassword} placeholder="********"/>
                </label>
                {error && <p className={styles.error}>{error}</p>}
                {successMessage && <p className={styles.success}>{successMessage}</p>}
                <button className={styles.button} type="submit" disabled={isLoggingIn || isResettingPassword}>
                    {isLoggingIn ? <LoadingSpinner size="small" text="Entrando..." inline={true} /> : 'Entrar'}
                </button>
                <button type="button" className={styles.linkButton} onClick={handlePasswordReset} disabled={isLoggingIn || isResettingPassword}>
                    {isResettingPassword ? <LoadingSpinner size="small" text="Enviando..." inline={true} /> : 'Esqueci minha senha'}
                </button>
                <button type="button" className={styles.buttonSecondary} onClick={() => navigate('/cadastro')} disabled={isLoggingIn || isResettingPassword}>
                    Não tem uma conta? Cadastre-se
                </button>
            </form>
        </div>
    );
}

export default Login;