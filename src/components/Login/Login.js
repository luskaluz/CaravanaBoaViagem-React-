import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import styles from './Login.module.css';
// Não precisa mais importar LoadingSpinner aqui

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false); // Estado para loading do login
    const [isResettingPassword, setIsResettingPassword] = useState(false); // Estado para loading do reset
    const navigate = useNavigate();

    useEffect(() => {
        if (!ADMIN_EMAIL) { console.error("ATENÇÃO: REACT_APP_ADMIN_EMAIL não definida!"); }
    }, []);

    const handleLogin = async (event) => {
        event.preventDefault();
        setError(''); setSuccessMessage('');
        setIsLoggingIn(true); // Ativa loading DO LOGIN

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
                if (userError.status !== 404) { throw userError; }
                console.log("Não usuário comum. Verificando funcionário...");
            }

            try {
                await api.getFuncionarioById(user.uid);
                console.log("É funcionário. Redirecionando...");
                navigate('/funcionario-dashboard'); return;
            } catch (funcionarioError) {
                if (funcionarioError.status !== 404 ) { throw funcionarioError; }
                console.warn("Usuário autenticado mas sem registro:", user.uid, user.email);
                setError("Conta autenticada, mas sem acesso registrado.");
                await auth.signOut();
            }
        } catch (authError) {
            console.error("Erro no processo de login:", authError);
            if(authError.code === 'auth/invalid-credential' || /*...*/ authError.code === 'auth/wrong-password'){ setError("Email ou senha inválidos."); }
            else if (authError.message.includes("verificar seus dados")) { setError(authError.message); }
            else { setError("Falha na autenticação. Verifique conexão."); }
        } finally {
            setIsLoggingIn(false); // Desativa loading DO LOGIN
        }
    };

    const handlePasswordReset = async () => {
        if (!email) { setError("Digite seu email para redefinir a senha."); return; }
        setError(''); setSuccessMessage('');
        setIsResettingPassword(true); // Ativa loading DO RESET
        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMessage(`Email de redefinição enviado para ${email}. Verifique sua caixa de entrada.`);
        } catch (resetError) {
            console.error("Erro no reset:", resetError.code, resetError.message);
            if (resetError.code === 'auth/user-not-found' || resetError.code === 'auth/invalid-email') { setError("Email não encontrado ou inválido."); }
            else { setError("Erro ao enviar email de redefinição."); }
        } finally {
            setIsResettingPassword(false); // Desativa loading DO RESET
        }
    };

    return (
        <div className={styles.container}>
            {/* Remove o overlay do LoadingSpinner מכאן */}
            <form className={styles.form} onSubmit={handleLogin}>
                <h2 className={styles.title}>Login</h2>
                <label className={styles.label}> Email:
                    <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoggingIn || isResettingPassword} />
                </label>
                <label className={styles.label}> Senha:
                    <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoggingIn || isResettingPassword} />
                </label>
                {error && <p className={styles.error}>{error}</p>}
                {successMessage && <p className={styles.success}>{successMessage}</p>}
                <button className={styles.button} type="submit" disabled={isLoggingIn || isResettingPassword}>
                    {isLoggingIn ? 'Entrando...' : 'Entrar'} {/* Texto do botão muda */}
                </button>
                <button type="button" className={styles.button} onClick={handlePasswordReset} disabled={isLoggingIn || isResettingPassword}>
                    {isResettingPassword ? 'Enviando...' : 'Esqueci minha senha'} {/* Texto do botão muda */}
                </button>
                <button type="button" className={styles.button} onClick={() => navigate('/cadastro')} disabled={isLoggingIn || isResettingPassword}>
                    Não tem uma conta? Cadastre-se
                </button>
            </form>
        </div>
    );
}

export default Login;