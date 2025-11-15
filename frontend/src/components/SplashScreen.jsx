import { useEffect, useState } from 'react';

const SplashScreen = () => {
  const [showSubtext, setShowSubtext] = useState(false);

  useEffect(() => {
    // Show subtext after logo animation starts
    const timer = setTimeout(() => {
      setShowSubtext(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className="flex flex-col items-center justify-center min-h-screen bg-[#111827]"
      data-testid="splash-screen"
    >
      <h1 className="luminous-text" data-testid="splash-logo">
        ResolveAI
      </h1>
      {showSubtext && (
        <p 
          className="text-gray-400 text-lg mt-6 fade-in"
          data-testid="splash-subtext"
        >
          Initializing secure environment...
        </p>
      )}
    </div>
  );
};

export default SplashScreen;