export function localizeEconomicTitle(rawTitle: string, lang: string = 'cs'): string {
  if (!rawTitle || typeof rawTitle !== 'string') return '';
  if (lang === 'en') return rawTitle;

  const t = rawTitle.trim();

  const exactMap: Record<string, { cs: string; es: string }> = {
    'Sentix Investor Confidence': { cs: 'Index důvěry investorů Sentix', es: 'Confianza del inversor Sentix' },
    'ISM Services Employment': { cs: 'Index zaměstnanosti ve službách ISM', es: 'Empleo en el sector servicios ISM' },
    'FOMC Member Speech & Market Outlook': { cs: 'Projev člena FOMC a tržní výhled', es: 'Discurso de miembro del FOMC y perspectivas' },
    'Claimant Count Change / Unemployment Rate': { cs: 'Změna počtu žadatelů o podporu / Míra nezaměstnanosti', es: 'Variación en peticiones de desempleo / Tasa de desempleo' },
    'Building Permits & Housing Starts': { cs: 'Stavební povolení a zahájené stavby domů', es: 'Permisos de construcción e inicios de viviendas' },
    'CB Consumer Confidence': { cs: 'Spotřebitelská důvěra Conference Board (CB)', es: 'Confianza del consumidor de The Conference Board' },
    'Core CPI m/m & Consumer Price Index y/y': { cs: 'Jádrová inflace CPI (m/m) a Index spotřebitelských cen (y/y)', es: 'IPC subyacente (m/m) e Índice de Precios al Consumidor (a/a)' },
    'Crude Oil Inventories': { cs: 'Týdenní zásoby ropy v USA (EIA)', es: 'Inventarios de petróleo crudo de la AIE' },
    'FOMC Meeting Minutes / Rate Decision': { cs: 'Zápis z jednání FOMC / Rozhodnutí o úrokových sazbách Fed', es: 'Minutas de la reunión del FOMC / Decisión de tipos de interés' },
    'ECB Main Refinancing Rate & Monetary Policy Statement': { cs: 'Rozhodnutí ECB o základní úrokové sazbě a měnové prohlášení', es: 'Tipo de interés principal del BCE y declaración de política monetaria' },
    'Initial Jobless Claims & PPI m/m': { cs: 'Nové žádosti o podporu v nezaměstnanosti a index cen výrobců (PPI)', es: 'Peticiones iniciales de subsidio por desempleo e IPP m/m' },
    'ECB Press Conference (Lagarde)': { cs: 'Tisková konference prezidentky ECB (Christine Lagarde)', es: 'Rueda de prensa del BCE (Christine Lagarde)' },
    'Non-Farm Employment Change (NFP) & Unemployment Rate': { cs: 'NFP - Tvorba pracovních míst mimo zemědělství a míra nezaměstnanosti', es: 'Nóminas no agrícolas (NFP) y Tasa de desempleo' },
    'Average Hourly Earnings m/m': { cs: 'Průměrný hodinový výdělek (m/m)', es: 'Ingresos medios por hora (m/m)' },
    'Prelim UoM Consumer Sentiment & Inflation Expectations': { cs: 'Předběžný spotřebitelský sentiment Michiganské univerzity (UoM) a inflační očekávání', es: 'Sentimiento preliminar del consumidor e inflación esperada (UoM)' },
    'US Core CPI / PPI Inflation': { cs: 'US Jádrová inflace (CPI / PPI)', es: 'IPC Subyacente / Inflación EE.UU.' },
    'Federal Funds Rate': { cs: 'Základní úroková sazba Fedu', es: 'Tasa de fondos federales' },
    'CPI m/m': { cs: 'Index spotřebitelských cen (CPI m/m)', es: 'IPC mensual (m/m)' },
    'Core CPI m/m': { cs: 'Jádrový index spotřebitelských cen (Core CPI m/m)', es: 'IPC subyacente mensual (m/m)' },
    'Retail Sales m/m': { cs: 'Maloobchodní tržby (m/m)', es: 'Ventas minoristas (m/m)' },
    'Core Retail Sales m/m': { cs: 'Jádrové maloobchodní tržby (m/m)', es: 'Ventas minoristas subyacentes (m/m)' },
    'Unemployment Claims': { cs: 'Nové žádosti o podporu v nezaměstnanosti', es: 'Peticiones de desempleo' },
    'GDP q/q': { cs: 'Hrubý domácí produkt (HDP q/q)', es: 'Producto Interior Bruto (PIB t/t)' },
    'Prelim GDP q/q': { cs: 'Předběžný HDP (q/q)', es: 'PIB preliminar (t/t)' },
    'Trade Balance': { cs: 'Obchodní bilance', es: 'Balanza comercial' },
    'ISM Manufacturing PMI': { cs: 'Index nákupních manažerů ve výrobě (ISM PMI)', es: 'PMI manufacturero del ISM' },
    'ISM Services PMI': { cs: 'Index nákupních manažerů ve službách (ISM PMI)', es: 'PMI de servicios del ISM' },
  };

  if (exactMap[t]) {
    return lang === 'es' ? exactMap[t].es : exactMap[t].cs;
  }

  let replaced = t;
  if (lang === 'cs') {
    replaced = replaced
      .replace(/\bNon-Farm Employment Change\b/gi, 'Změna zaměstnanosti mimo zemědělství (NFP)')
      .replace(/\bUnemployment Rate\b/gi, 'Míra nezaměstnanosti')
      .replace(/\bUnemployment Claims\b/gi, 'Žádosti o podporu v nezaměstnanosti')
      .replace(/\bInitial Jobless Claims\b/gi, 'Nové žádosti o podporu v nezaměstnanosti')
      .replace(/\bCore CPI\b/gi, 'Jádrová inflace CPI')
      .replace(/\bConsumer Price Index\b/gi, 'Index spotřebitelských cen')
      .replace(/\bCPI\b/g, 'Inflace CPI')
      .replace(/\bCore PPI\b/gi, 'Jádrový index cen výrobců (PPI)')
      .replace(/\bPPI\b/g, 'Index cen výrobců (PPI)')
      .replace(/\bRetail Sales\b/gi, 'Maloobchodní tržby')
      .replace(/\bCore Retail Sales\b/gi, 'Jádrové maloobchodní tržby')
      .replace(/\bGross Domestic Product\b/gi, 'Hrubý domácí produkt (HDP)')
      .replace(/\bGDP\b/g, 'HDP')
      .replace(/\bBuilding Permits\b/gi, 'Stavební povolení')
      .replace(/\bHousing Starts\b/gi, 'Zahájené stavby domů')
      .replace(/\bConsumer Confidence\b/gi, 'Spotřebitelská důvěra')
      .replace(/\bConsumer Sentiment\b/gi, 'Spotřebitelský sentiment')
      .replace(/\bCrude Oil Inventories\b/gi, 'Zásoby ropy')
      .replace(/\bNatural Gas Storage\b/gi, 'Zásoby zemního plynu')
      .replace(/\bTrade Balance\b/gi, 'Obchodní bilance')
      .replace(/\bManufacturing PMI\b/gi, 'PMI ve výrobě')
      .replace(/\bServices PMI\b/gi, 'PMI ve službách')
      .replace(/\bMonetary Policy Statement\b/gi, 'Měnové prohlášení')
      .replace(/\bRate Decision\b/gi, 'Rozhodnutí o úrokových sazbách')
      .replace(/\bInterest Rate\b/gi, 'Úroková sazba')
      .replace(/\bPress Conference\b/gi, 'Tisková konference')
      .replace(/\bMeeting Minutes\b/gi, 'Zápis z jednání')
      .replace(/\bPrelim\b/gi, 'Předběžný')
      .replace(/\bFlash\b/gi, 'Bleskový odhad');
  } else if (lang === 'es') {
    replaced = replaced
      .replace(/\bNon-Farm Employment Change\b/gi, 'Nóminas no agrícolas (NFP)')
      .replace(/\bUnemployment Rate\b/gi, 'Tasa de desempleo')
      .replace(/\bUnemployment Claims\b/gi, 'Peticiones de desempleo')
      .replace(/\bInitial Jobless Claims\b/gi, 'Peticiones iniciales de desempleo')
      .replace(/\bCore CPI\b/gi, 'IPC subyacente')
      .replace(/\bConsumer Price Index\b/gi, 'Índice de Precios al Consumidor (IPC)')
      .replace(/\bCPI\b/g, 'IPC')
      .replace(/\bCore PPI\b/gi, 'IPP subyacente')
      .replace(/\bPPI\b/g, 'Índice de Precios del Productor (IPP)')
      .replace(/\bRetail Sales\b/gi, 'Ventas minoristas')
      .replace(/\bCore Retail Sales\b/gi, 'Ventas minoristas subyacentes')
      .replace(/\bGross Domestic Product\b/gi, 'Producto Interior Bruto (PIB)')
      .replace(/\bGDP\b/g, 'PIB')
      .replace(/\bBuilding Permits\b/gi, 'Permisos de construcción')
      .replace(/\bHousing Starts\b/gi, 'Inicios de viviendas')
      .replace(/\bConsumer Confidence\b/gi, 'Confianza del consumidor')
      .replace(/\bConsumer Sentiment\b/gi, 'Sentimiento del consumidor')
      .replace(/\bCrude Oil Inventories\b/gi, 'Inventarios de petróleo crudo')
      .replace(/\bNatural Gas Storage\b/gi, 'Almacenamiento de gas natural')
      .replace(/\bTrade Balance\b/gi, 'Balanza comercial')
      .replace(/\bManufacturing PMI\b/gi, 'PMI manufacturero')
      .replace(/\bServices PMI\b/gi, 'PMI de servicios')
      .replace(/\bMonetary Policy Statement\b/gi, 'Declaración de política monetaria')
      .replace(/\bRate Decision\b/gi, 'Decisión de tipos de interés')
      .replace(/\bInterest Rate\b/gi, 'Tipo de interés')
      .replace(/\bPress Conference\b/gi, 'Rueda de prensa')
      .replace(/\bMeeting Minutes\b/gi, 'Minutas de la reunión')
      .replace(/\bPrelim\b/gi, 'Preliminar')
      .replace(/\bFlash\b/gi, 'Estimación rápida');
  }
  return replaced;
}
