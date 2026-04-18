export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] text-black px-6 py-10">
      <header className="max-w-6xl mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-semibold tracking-tight">SPACENODE</h1>
        <button className="bg-black text-white px-5 py-2 rounded-full">
          Entrar
        </button>
      </header>

      <section className="max-w-5xl mx-auto text-center py-24">
        <p className="uppercase text-sm tracking-[0.3em] text-neutral-500">
          BETA ABERTO
        </p>

        <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mt-4">
          Renders que vendem o projeto.
        </h2>

        <p className="text-neutral-600 text-lg mt-6 max-w-2xl mx-auto">
          Transforme sketches, plantas e modelos 3D em imagens premium em
          segundos com IA criada para arquitetura.
        </p>

        <div className="flex gap-3 justify-center mt-8">
          <button className="bg-black text-white px-6 py-3 rounded-full">
            Começar grátis
          </button>

          <button className="border px-6 py-3 rounded-full bg-white">
            Ver demo
          </button>
        </div>
      </section>
    </main>
  );
}