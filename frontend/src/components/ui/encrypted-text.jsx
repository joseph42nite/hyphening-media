import React, { useState, useEffect, useRef } from 'react';

const DEFAULT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}:<>?";

export function EncryptedText({
  text = "",
  revealDelayMs = 50,
  scrambleSpeed = 30,
  className = "",
  encryptedClassName = "",
  revealedClassName = "",
  triggerOnHover = true,
  loop = false,
  loopDelayMs = 5000
}) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [scrambleChars, setScrambleChars] = useState("");

  const startAnimation = () => {
    setRevealedCount(0);
    let initial = "";
    for (let i = 0; i < text.length; i++) {
      if (text[i] === " ") {
        initial += " ";
      } else {
        initial += DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)];
      }
    }
    setScrambleChars(initial);
  };

  // Start animation on mount or when text changes
  useEffect(() => {
    startAnimation();
  }, [text]);

  // Handle gradual reveal
  useEffect(() => {
    if (revealedCount >= text.length) return;

    const timer = setTimeout(() => {
      setRevealedCount(prev => prev + 1);
    }, revealDelayMs);

    return () => clearTimeout(timer);
  }, [revealedCount, text, revealDelayMs]);

  // Handle continuous scrambling of remaining unrevealed characters
  useEffect(() => {
    if (revealedCount >= text.length) return;

    const scrambleInterval = setInterval(() => {
      setScrambleChars(prev => {
        let next = "";
        for (let i = 0; i < text.length; i++) {
          if (i < revealedCount) {
            next += text[i];
          } else if (text[i] === " ") {
            next += " ";
          } else {
            next += DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)];
          }
        }
        return next;
      });
    }, scrambleSpeed);

    return () => clearInterval(scrambleInterval);
  }, [revealedCount, text, scrambleSpeed]);

  // Handle looping after completion
  useEffect(() => {
    if (!loop || revealedCount < text.length) return;

    const timeout = setTimeout(() => {
      startAnimation();
    }, loopDelayMs);

    return () => clearTimeout(timeout);
  }, [revealedCount, text.length, loop, loopDelayMs]);

  const handleMouseEnter = () => {
    if (triggerOnHover && revealedCount >= text.length) {
      startAnimation();
    }
  };

  return (
    <span 
      className={className} 
      onMouseEnter={handleMouseEnter}
      style={{ cursor: triggerOnHover ? 'pointer' : 'default' }}
    >
      {text.split("").map((char, index) => {
        const isRevealed = index < revealedCount;
        if (char === " ") return <span key={index}> </span>;
        
        return (
          <span
            key={index}
            className={isRevealed ? revealedClassName : encryptedClassName}
          >
            {isRevealed ? char : (scrambleChars[index] || char)}
          </span>
        );
      })}
    </span>
  );
}
