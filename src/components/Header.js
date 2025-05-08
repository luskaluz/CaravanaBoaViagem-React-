import React, { useState, useEffect, useMemo } from 'react'; // <<< ADICIONADO useMemo AQUI
import styles from './Header.module.css';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../services/api';


function Header() {
  const [userAuth, setUserAuth] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUserAuth(currentUser);
      if (currentUser) {
        try {
          console.log("Header: Usuário autenticado, buscando perfil na API...");
          const profile = await api.getUserProfile();
          console.log("Header: Perfil recebido:", profile);
          setUserProfile(profile);
        } catch (error) {
          console.error("Header: Erro ao buscar perfil do usuário:", error);
          setUserProfile({
              nome: currentUser.displayName || currentUser.email,
              tipo: 'unknown',
              error: true
          });
        }
      } else {
        setUserProfile(null);
      }
      setIsLoadingUser(false);
    });
    return () => unsubscribe();
  }, []);

  const displayUserName = useMemo(() => {
      if (userProfile && userProfile.nome) {
          return userProfile.nome;
      }
      if (userAuth) {
          return userAuth.displayName || userAuth.email;
      }
      return '';
  }, [userAuth, userProfile]);


  return (
    <header>
        <nav className={styles.navbar}>
            <ul className={styles.menu}>
                <img src="./images/logocbv.svg" alt="Logo" className={styles.logo} />
                <li><Link to="/">Home</Link></li>
                <li><Link to="/sobre">Sobre</Link></li>
                <li><Link to="/roteiros">Roteiros</Link></li>

                {isLoadingUser ? (
                    <li className={styles.loadingAuthLink}>Carregando...</li>
                ) : userAuth ? (
                    <li><Link to="/login" className={styles.userLink}>Olá, {displayUserName}</Link></li>
                ) : (
                    <>
                        <li><Link to="/cadastro">Cadastro</Link></li>
                    </>
                )}
            </ul>
        </nav>
    </header>
  );
}

export default Header;