# RareSkills Solidity Security Repository

This repository contains a comprehensive collection of Solidity security challenges, vulnerability examples, and learning materials focused on smart contract security. It serves as a practical learning resource for developers who want to understand common security pitfalls in Ethereum smart contracts and how to exploit and prevent them.

## 🎯 Purpose

The primary goal of this repository is to provide hands-on experience with real-world smart contract vulnerabilities through:
- **Capture the Ether** challenges - A series of Ethereum CTF (Capture The Flag) challenges
- **Vulnerability examples** - Practical demonstrations of common security flaws
- **Exploit implementations** - Working examples of how vulnerabilities can be exploited
- **Test cases** - Comprehensive testing to verify vulnerability understanding

## 📚 Learning Path

### Week 1: Foundation
- **Capture the Ether Challenges**
  - `GuessNewNumber` - Understanding predictable number generation
  - `GuessRandomNumber` - Exploiting weak randomness
  - `GuessSecretNumber` - Brute force attacks on secret values
  - `PredictTheBlockhash` - Block hash prediction attacks
  - `PredictTheFuture` - Future block prediction vulnerabilities

- **Reentrancy Attacks**
  - `TokenBank` - Classic reentrancy vulnerability
  - `TokenWhale` - Reentrancy in token operations
  - `RetirementFund` - Reentrancy in fund management
  - `TokenSale` - Reentrancy in token sales

### Week 2: Advanced Topics
- **Business Logic & DoS**
  - `SideEntrance` - Side channel attacks
  - `TokenSale` - Business logic flaws
  - `RetirementFund` - Denial of service vulnerabilities

- **Additional Vulnerabilities**
  - `ERC1155` exploits
  - `AlphaGoatClub` - Access control issues
  - `Democracy` - Voting mechanism vulnerabilities
  - `FlashLoanCTF` - Flash loan attack scenarios

## 🛠️ Technology Stack

- **Solidity** - Smart contract development
- **Foundry** - Testing and deployment framework
- **Hardhat** - Alternative development environment
- **Forge Standard Library** - Testing utilities and cheatcodes

## 🚀 Getting Started

Each challenge directory contains:
- `src/` - The vulnerable smart contract
- `test/` - Test files demonstrating the exploit
- `script/` - Deployment scripts
- `foundry.toml` - Foundry configuration

### Prerequisites
- Foundry installed (`curl -L https://foundry.paradigm.xyz | bash`)
- Basic understanding of Solidity and Ethereum

### Running Challenges
```bash
cd [challenge-name]
forge test
```

## ⚠️ Security Notice

**This repository is for educational purposes only.** The contracts contained herein are intentionally vulnerable and should never be deployed to mainnet or any production environment. These examples are designed to teach security concepts through practical exploitation.

## 🎓 Learning Objectives

By completing these challenges, you will learn to:
- Identify common smart contract vulnerabilities
- Understand how attackers exploit these weaknesses
- Implement proper security measures
- Use testing frameworks to verify security
- Develop a security-first mindset for smart contract development

## 📖 Additional Resources

- [Capture the Ether](https://capturetheether.com/) - Original challenge platform
- [SWC Registry](https://swcregistry.io/) - Smart Contract Weakness Classification
- [Consensys Smart Contract Best Practices](https://consensys.net/blog/developers/smart-contract-security-best-practices/)

## 🤝 Contributing

Feel free to submit issues, improvements, or additional vulnerability examples. This is a learning resource, so contributions that enhance understanding are welcome.

## 📄 License

This project is for educational purposes. Please ensure you comply with the original challenge licenses and terms of service when applicable.

---

*Last updated: August 2025*    