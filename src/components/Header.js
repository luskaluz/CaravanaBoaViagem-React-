// src/components/Header.js
import React from 'react';
import styles from './Header.module.css'; 
function Header() {

  return (
    <header>
        <nav className={styles.navbar}>
            <ul className={styles.menu}>
                <img src="./images/logocbv.svg" alt="Logo" className={styles.logo} />
                <li><a href="/">Home</a></li>
                <li><a href="/sobre">Sobre</a></li>
                <li><a href="/roteiros">Roteiros</a></li>
                <li><a href="/galeria">Galeria</a></li>
                <li><a href="/cadastro">Cadastro</a></li>
            </ul>
        </nav>
    </header>
  );
}

export default Header;