// src/components/Login/Login.js
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
    const navigate = useNavigate();

    const handleLogin = async (event) => {
        event.preventDefault();
        setError('');

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (user.email === "adm@adm.com") {
                navigate('/admin-dashboard');
                return;
            }

            try {
                const userData = await api.getDadosUsuario(user.uid);
                if (userData) {
                    navigate('/dashboard');
                    return;
                }
            } catch (userError) {

                if (userError.message !== 'Usuário não encontrado.') {
                      console.error("Erro inesperado ao buscar dados do usuário:", userError);
                    setError("Erro ao buscar dados do usuário.");
                    return;
                }
            }

        } catch (authError) {
			console.error("Erro de autenticação", authError)

           if(authError.code === 'auth/invalid-login-credentials'){
              setError("Credenciais Inválidas")
              return
           }
			  setError("Erro de autenticação")
        }
    };

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
                />
                </label>
                {error && <p className={styles.error}>{error}</p>}
                <button className={styles.button} type="submit">Entrar</button>
                <button type="button" className={styles.button} onClick={() => navigate('/cadastro')}>
                    Não tem uma conta?  Cadastre-se
                </button>
            </form>
        </div>
    );
}

export default Login;
