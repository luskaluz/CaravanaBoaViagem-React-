import React, { useState, useEffect } from 'react';
// import { Link } from 'react-router-dom'; // << REMOVER IMPORT DO LINK
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import * as api from '../services/api';
import styles from './Header.module.css';

const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL;

function Header() {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loadingUser, setLoadingUser] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                setLoadingUser(true);
                try {
                    const data = await api.getDadosUsuario(currentUser.uid);
                    setUserData(data);
                } catch (error) {
                    if (error.status !== 404) {
                         console.error("Erro ao buscar dados do usuário no Header:", error);
                    }
                    setUserData(null);
                } finally {
                    setLoadingUser(false);
                }
            } else {
                setUserData(null);
                setLoadingUser(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const getDashboardLink = () => {
        if(user && ADMIN_EMAIL && user.email === ADMIN_EMAIL) return '/admin-dashboard';
        if (user) return '/dashboard';
        return '/login';
    };

    return (
        <header>
            <nav className={styles.navbar}>
                <ul className={styles.menu}>
                    <li>
                        {/* Link para Home como <a> */}
                        <a href="/">
                            <img src="./images/logocbv.svg" alt="Logo" className={styles.logo} />
                        </a>
                    </li>
                    {/* Links de navegação como <a> */}
                    <li><a href="/">Home</a></li>
                    <li><a href="/sobre">Sobre</a></li>
                    <li><a href="/roteiros">Roteiros</a></li>

                    <li className={styles.navItemRight}>
                        {loadingUser ? (
                            <span>Carregando...</span>
                        ) : user ? (
                            <a href={getDashboardLink()} className={styles.userNameLink}>
                                Olá, {userData?.nome || user?.displayName || user?.email || 'Meu Perfil'}
                            </a>
                        ) : (
                            // Link para Cadastro como <a>
                            <a href="/cadastro">Cadastro</a>
                        )}
                    </li>
                </ul>
            </nav>
        </header>
    );
}

export default Header;