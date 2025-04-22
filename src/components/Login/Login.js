import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import * as api from '../../services/api';
import styles from './Login.module.css';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (event) => {
        event.preventDefault();
        setError('');
        setIsLoading(true); 

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user.email === "adm@adm.com") {
                setIsLoading(false);
                navigate('/admin-dashboard');
                return;
            }

            try {
                await api.getDadosUsuario(user.uid);
                setIsLoading(false);
                navigate('/dashboard');
                return;
            } catch (userError) {
                if (!userError.message.toLowerCase().includes('usuário não encontrado') && userError.status !== 404) {
                    console.error("Erro inesperado ao buscar dados do usuário:", userError);
                    setError("Erro ao verificar seus dados. Tente novamente."); 
                    setIsLoading(false);
                    return;
                }
            }

            
            try {
                await api.getFuncionarioById(user.uid);
                setIsLoading(false);
                navigate('/funcionario-dashboard');
                return;
            } catch (funcionarioError) {
                 if (!funcionarioError.message.toLowerCase().includes('não encontrado') && funcionarioError.status !== 404 ) {
                    console.error("Erro inesperado ao buscar dados do funcionário:", funcionarioError);
                    setError("Erro ao verificar seus dados como funcionário."); 
                 } else {
                     console.warn("Usuário autenticado mas não encontrado:", user.uid);
                     setError("Conta não encontrada ou não registrada.");
                 }
                 setIsLoading(false);
                 return; // Para aqui
            }

        } catch (authError) {
            console.error("Erro de autenticação:", authError.code, authError.message);
            // Mantém sua lógica original de tratamento de erro de auth
           if(authError.code === 'auth/invalid-credential' || authError.code === 'auth/invalid-login-credentials'){
              setError("Credenciais Inválidas");
           } else {
               setError("Falha na autenticação."); // Mensagem mais genérica
           }
            setIsLoading(false);
        }
    };

    // JSX (sem alterações lógicas, apenas adicionado 'disabled' e texto condicional no botão)
    return (
        <div className={styles.container}>
            <form className={styles.form} onSubmit={handleLogin}>
                <h2 className={styles.title}>Login</h2>

                <label className={styles.label}>
                  Email:
                <input
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                />
               </label>
                <label className={styles.label}>
                 Senha:
                <input
                    className={styles.input}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                />
                </label>
                {error && <p className={styles.error}>{error}</p>}
                <button className={styles.button} type="submit" disabled={isLoading}>
                    {isLoading ? 'Entrando...' : 'Entrar'}
                </button>
                {/* Use uma classe diferente para o botão secundário se quiser estilizá-lo diferente */}
                <button type="button" className={styles.buttonSecondary || styles.button} onClick={() => navigate('/cadastro')} disabled={isLoading}>
                    Não tem uma conta? Cadastre-se
                </button>
            </form>
        </div>
    );
}

export default Login;