import React from 'react';
import styles from './Footer.module.css';

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.footerSection}>
          <h3>Sobre Nós</h3>
          <p><a href="/sobre">Acesse a página sobre nós.</a></p>
        </div>

        <div className={styles.footerSection}>
          <h3>Contato</h3>
          <ul className={styles.contactList}>
            <li>📞 (11) 2222-2222</li>
            <li>✉️ contato@caravanaboaviagem.com.br</li>
            <li>📍 Rua das Caravanas, 123 - São Paulo/SP</li>
          </ul>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <p>© 2025 Caravana da Boa Viagem. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}

export default Footer;