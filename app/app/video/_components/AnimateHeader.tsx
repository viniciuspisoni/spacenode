'use client'

// Header do Animar — título + uma linha.
//
// Este texto cai DIRETO no papel de parede (o render borrado do usuário), e
// sobre o papel só sobrevive título e linha curta (docs/VIDRO-NO-APP.md §2.2).
// A promessa longa que estava aqui foi para o estado vazio do palco, que é
// vidro — lá ela tem contraste e o leitor tem tempo de ler.

export default function AnimateHeader() {
  return (
    <div style={{
      padding:    '18px 12px 12px 4px',
      flexShrink: 0,
    }}>
      <div style={{
        fontSize:    18,
        fontWeight:  500,
        color:       'var(--color-text-primary)',
        letterSpacing: '-0.02em',
      }}>
        Animar
      </div>
      <div style={{
        fontSize:      12,
        color:         'var(--color-text-tertiary)',
        marginTop:     3,
        letterSpacing: '-0.005em',
      }}>
        De uma imagem de projeto a um vídeo de apresentação.
      </div>
    </div>
  )
}
