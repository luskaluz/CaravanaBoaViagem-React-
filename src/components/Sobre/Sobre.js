import React from 'react';
import styles from './Sobre.module.css';

function Sobre() {
  return (
    <main className={styles.servicosSection}> 
      <h1>Sobre Nós</h1>
      <div className={styles.sobreDesc}>
        <p>
          Somos uma caravana com mais de dez anos de tradição. Sempre
          transportando vidas com responsabilidade, confiança e segurança.
          Viagens nacionais e internacionais, com todo o conforto e
          praticidade.
        </p>
        <br />
        <p>
          Se você ama viajar e deseja explorar os encantos das cidades do
          estado de São Paulo com conforto, segurança e organização, nossa
          empresa é a escolha ideal para você! Oferecemos passeios e viagens
          para diversos destinos, proporcionando experiências inesquecíveis
          para grupos de amigos, famílias e empresas.
        </p>
      </div>
      <section className={styles.servicos}>
        <h2 className={styles.servicosTitle}>Nossos Serviços</h2>
        <ul className={styles.servicosList}>
          <li className={styles.servicosItem}>
            <strong>Excursões turísticas:</strong> Viagens organizadas para
            as principais cidades e pontos turísticos de São Paulo, como
            Atibaia, Brotas, Campos do Jordão, litoral paulista e muito mais.
          </li>
          <li className={styles.servicosItem}>
            <strong>Passeios personalizados:</strong> Roteiros exclusivos
            planejados de acordo com a necessidade do grupo, seja para
            turismo, lazer ou fins corporativos.
          </li>
          <li className={styles.servicosItem}>
            <strong>Transporte confortável e seguro:</strong> Contamos com
            ônibus e vans modernos, equipados com ar-condicionado, poltronas
            reclináveis e segurança garantida.
          </li>
          <li className={styles.servicosItem}>
            <strong>Guias especializados:</strong> Nossa equipe está
            preparada para proporcionar informações e suporte durante toda a
            viagem, garantindo uma experiência enriquecedora.
          </li>
        </ul>
      </section>

      <p>
        Seja para um passeio de um dia ou uma viagem mais longa, estamos
        prontos para levar você aos melhores destinos com qualidade e
        profissionalismo.
      </p>
      <br />
      <p>
        <strong>
          Entre em contato conosco e embarque nessa jornada inesquecível!
        </strong>
      </p>
      <br />
    </main>
  );
}

export default Sobre;

