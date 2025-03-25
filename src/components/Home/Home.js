// src/components/Home/Home.js
import React from 'react';
import Banner from '../Banner/banner';
import Carrossel from '../Carrossel/Carrossel';
import Eventos from '../Eventos/Eventos';
import styles from './Home.module.css';

function Home() {
  return (
    <div className={styles.homeContainer}>
      <Banner/>
      <Carrossel/>
      <Eventos/>
    </div>
  );
}

export default Home;

