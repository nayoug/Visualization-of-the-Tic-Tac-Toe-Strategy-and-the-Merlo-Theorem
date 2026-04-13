// 井字棋核心逻辑

// 棋盘位置编号：1-9
// 1 2 3
// 4 5 6
// 7 8 9

export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type StrategyType = 'win' | 'lose' | 'draw';

export interface GameNode {
  id: string;
  board: CellValue[];  // 9个位置的棋盘状态
  player: Player;      // 当前轮到谁下棋
  value: number;       // 1=X胜, 0=平, -1=O胜 (相对于当前玩家)
  strategyType: StrategyType;
  children: GameNode[];
  parent: GameNode | null;
  movePosition: number | null;  // 从父节点到该节点的走法位置(1-9)
  depth: number;                // 距根节点的层数
  layerFromTerminal: number;    // 距终局的层数（用于逆向推理展示）
  expanded: boolean;
  highlighted: boolean;
  derivedFromChildren: boolean;
  bestChildren: GameNode[];
}

// 检查游戏是否结束
// 终局定义：所有9个格子都填满（已下完所有棋子），可辨别胜负或平局
export function checkWinner(board: CellValue[]): { winner: Player | 'draw' | null, lines: number[][] } {
  const lines = [
    [0, 1, 2], // 上横
    [3, 4, 5], // 中横
    [6, 7, 8], // 下横
    [0, 3, 6], // 左竖
    [1, 4, 7], // 中竖
    [2, 5, 8], // 右竖
    [0, 4, 8], // 左上到右下
    [2, 4, 6], // 右上到左下
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], lines: [line] };
    }
  }

  // 终局：所有9个格子都填满（已下完所有棋子）
  if (!board.includes(null)) {
    return { winner: 'draw', lines: [] };
  }

  return { winner: null, lines: [] };
}

// 获取当前玩家的下一个可能走法
export function getAvailableMoves(board: CellValue[]): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      moves.push(i);
    }
  }
  return moves;
}

// 生成唯一的节点ID
export function generateNodeId(board: CellValue[], player: Player): string {
  return board.map(c => c || '-').join('') + '_' + player;
}

// 判断棋盘是否等价（用于对称性剪枝）
// 旋转和翻转
export function getBoardSignature(board: CellValue[]): string {
  const boards: CellValue[][] = [];

  // 原始
  boards.push([...board]);
  // 旋转90
  boards.push([board[6], board[3], board[0], board[7], board[4], board[1], board[8], board[5], board[2]]);
  // 旋转180
  boards.push([board[8], board[7], board[6], board[5], board[4], board[3], board[2], board[1], board[0]]);
  // 旋转270
  boards.push([board[2], board[5], board[8], board[1], board[4], board[7], board[0], board[3], board[6]]);
  // 水平翻转
  boards.push([board[2], board[1], board[0], board[5], board[4], board[3], board[8], board[7], board[6]]);
  // 水平翻转+旋转90
  boards.push([board[6], board[7], board[8], board[3], board[4], board[5], board[0], board[1], board[2]]);
  // 水平翻转+旋转180
  boards.push([board[8], board[7], board[6], board[5], board[4], board[3], board[2], board[1], board[0]]);
  // 水平翻转+旋转270
  boards.push([board[2], board[5], board[8], board[1], board[4], board[7], board[0], board[3], board[6]]);

  // 返回字典序最小的签名
  return boards.map(b => b.map(c => c || '-').join('')).sort()[0];
}

// 使用minimax计算节点价值（全局视角）
// 返回全局视角的结果：+1=先手X必胜, -1=后手O必胜, 0=平局
// 
// 核心逻辑：
// - 先手X必胜：X有至少一个走法，使得无论O怎么走，最终都是X胜
// - 后手O必胜：O有至少一个走法，使得无论X怎么走，最终都是O胜
// - 平局：双方都无法获胜，最优策略下结果为平局
export function minimax(board: CellValue[], player: Player, depth: number = 0): number {
  // 终局判断
  const result = checkWinner(board);
  if (result.winner === 'X') return 1;  // 先手X胜
  if (result.winner === 'O') return -1; // 后手O胜
  if (result.winner === 'draw') return 0; // 平局

  const availableMoves = getAvailableMoves(board);
  const opponent = player === 'X' ? 'O' : 'X';

  // 计算所有子节点的价值
  const childValues: number[] = [];
  for (const move of availableMoves) {
    const newBoard = [...board];
    newBoard[move] = player;
    const value = minimax(newBoard, opponent, depth + 1);
    childValues.push(value);
  }

  // 全局视角判断（关键逻辑）
  let bestValue: number;
  
  if (player === 'X') {
    // 当前轮到X下棋（X想要value=1）
    // X会选择最有利于自己的走法
    // 如果存在一个走法能让X必胜（value=1），X就会选它 → 先手必胜
    // 如果所有走法都导致O必胜（value=-1），那就是先手必败
    // 否则平局
    if (childValues.some(v => v === 1)) {
      bestValue = 1;   // X有必胜策略
    } else if (childValues.every(v => v === -1)) {
      bestValue = -1;  // 所有走法都导致O胜
    } else {
      bestValue = 0;   // 最优策略下平局
    }
  } else {
    // 当前轮到O下棋（O想要value=-1）
    // O会选择最有利于自己的走法
    // 如果存在一个走法能让O必胜（value=-1），O就会选它 → 后手必胜
    // 如果所有走法都导致X必胜（value=1），那就是先手必胜
    // 否则平局
    if (childValues.some(v => v === -1)) {
      bestValue = -1;  // O有必胜策略
    } else if (childValues.every(v => v === 1)) {
      bestValue = 1;   // 所有走法都导致X胜
    } else {
      bestValue = 0;   // 最优策略下平局
    }
  }

  return bestValue;
}

// 设置strategyType（全局视角：+1=先手X胜 → win, -1=先手败 → lose, 0=平局 → draw）
function setStrategyType(node: GameNode): void {
  // node.value 是全局视角：+1=先手X必胜, -1=先手必败, 0=平局
  if (node.value === 1) {
    node.strategyType = 'win';
  } else if (node.value === -1) {
    node.strategyType = 'lose';
  } else {
    node.strategyType = 'draw';
  }
}

// 获取指定层数的子树（用于展示）
export function generateGameTree(maxDepth: number = 9): GameNode {
  const rootBoard: CellValue[] = Array(9).fill(null);
  const root: GameNode = {
    id: generateNodeId(rootBoard, 'X'),
    board: rootBoard,
    player: 'X',
    value: 0,
    strategyType: 'draw',
    children: [],
    parent: null,
    movePosition: null,
    depth: 0,
    layerFromTerminal: 9,
    expanded: false,
    highlighted: false,
    derivedFromChildren: false,
    bestChildren: [],
  };

  // 使用深度优先搜索生成完整的树
  const buildTree = (node: GameNode): void => {
    // 检查游戏是否结束
    const result = checkWinner(node.board);
    if (result.winner !== null) {
      // 终局节点：直接根据获胜者设置全局视角的value
      if (result.winner === 'X') {
        node.value = 1;   // 先手X胜
      } else if (result.winner === 'O') {
        node.value = -1;  // 后手O胜
      } else {
        node.value = 0;   // 平局
      }
      setStrategyType(node);
      node.children = [];
      return;
    }

    // 生成所有走法
    const availableMoves = getAvailableMoves(node.board);
    const opponent = node.player === 'X' ? 'O' : 'X';

    for (const move of availableMoves) {
      const newBoard = [...node.board];
      newBoard[move] = node.player;

      const childId = generateNodeId(newBoard, opponent);

      const child: GameNode = {
        id: childId,
        board: newBoard,
        player: opponent,
        value: 0,
        strategyType: 'draw',
        children: [],
        parent: node,
        movePosition: move + 1,
        depth: node.depth + 1,
        layerFromTerminal: 0,
        expanded: false,
        highlighted: false,
        derivedFromChildren: false,
        bestChildren: [],
      };

      node.children.push(child);

      // 继续生成子树（直到终局或达到最大深度）
      if (node.depth < maxDepth) {
        buildTree(child);
      } else if (child.children.length === 0) {
        // 如果达到最大深度但游戏未结束，用minimax计算
        child.value = minimax(child.board, child.player);
        setStrategyType(child);
      }
    }

    // 子树生成完后，用minimax计算当前节点价值
    node.value = minimax(node.board, node.player);
    setStrategyType(node);

    // 标记最优走法（关键修正）
    // 当前玩家会选择对自己最有利的走法
    if (node.player === 'X') {
      // X想要value尽可能大（朝着+1方向）
      // 如果当前节点value=1，X会选择value=1的子节点
      // 如果当前节点value=0，X会选择value=0的子节点（避免-1）
      // 如果当前节点value=-1，所有子节点都是-1
      for (const child of node.children) {
        if (child.value === node.value) {
          node.bestChildren.push(child);
        }
      }
    } else {
      // O想要value尽可能小（朝着-1方向）
      // 如果当前节点value=-1，O会选择value=-1的子节点
      // 如果当前节点value=0，O会选择value=0的子节点（避免+1）
      // 如果当前节点value=1，所有子节点都是+1
      for (const child of node.children) {
        if (child.value === node.value) {
          node.bestChildren.push(child);
        }
      }
    }
  };

  buildTree(root);

  // 计算每个节点的layerFromTerminal
  calculateLayersFromTerminal(root);

  return root;
}

// 计算每个节点距终局的层数
function calculateLayersFromTerminal(root: GameNode): void {
  const leaves: GameNode[] = [];
  const stack: GameNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.children.length === 0) {
      leaves.push(node);
    } else {
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }

  // 从叶子节点向上计算层数
  for (const leaf of leaves) {
    let node: GameNode | null = leaf;
    while (node !== null) {
      if (node.layerFromTerminal < node.depth) {
        node.layerFromTerminal = node.depth;
      }
      node = node.parent;
    }
  }
}

// 获取指定层数的子树（用于展示）
export function getTreeAtLayer(root: GameNode, targetLayer: number): GameNode {
  function copyNode(node: GameNode, parent: GameNode | null): GameNode {
    const newNode: GameNode = {
      ...node,
      parent,
      children: [],
      expanded: false,
      highlighted: false,
    };

    if (node.layerFromTerminal <= targetLayer && node.children.length > 0) {
      for (const child of node.children) {
        if (child.layerFromTerminal < targetLayer ||
            (child.layerFromTerminal === targetLayer && child.children.length === 0)) {
          newNode.children.push(copyNode(child, newNode));
        }
      }
    }

    return newNode;
  }

  return copyNode(root, null);
}

// 展开指定层数的节点
export function expandToLayer(root: GameNode, layer: number): GameNode {
  const stack: GameNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.layerFromTerminal < layer) {
      node.expanded = true;
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }

  return root;
}