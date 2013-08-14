require 'spec_helper'

describe Game do
  it "has a valid factory" do
    FactoryGirl.create(:game).should be_valid
  end

  subject(:game) do
    g = FactoryGirl.create(:game)
    2.times { g.players << FactoryGirl.create(:player) }
    g
  end
  before { game.setup_game }
  let(:white)   { game.players.first }
  let(:black)   { game.players.last }
  let(:players) { game.players }

  describe "#setup_game" do
    it "has 30 cards" do
      game.cards.count.should eq(30)
    end

    it "has 24 cards in deck" do
      game.cards.where(location: "deck").count.should eq(24)
    end

    it "has 6 cards in player hands" do
      game.cards.where(location: "hand").count.should eq(6)
    end

    it "has 30 tokens" do
      game.damage_tokens.count.should eq(30)
    end

    it "has 2 tanks" do
      game.tanks.count.should eq(2)
    end
  end

  describe "#deal" do
    it "deals cards to a player" do
      game.deal(3, white)
      white.cards.count.should eq(6)
      game.cards.where(location: "deck").count.should eq(21)
    end

    it "cycles from 1 card" do
      game.cards.where(location: "deck")[0...-1].each do |card|
        card.update_attributes(location: "discard")
      end

      game.deal(3, white)
      game.cards.where(location: "discard").count.should eq(0)
      game.cards.where(location: "deck").count.should eq(21)
    end

    it "cycles from 0 cards" do
      game.cards.where(location: "deck").each do |card|
        card.update_attributes(location: "discard")
      end

      game.deal(3, white)
      game.cards.where(location: "discard").count.should eq(0)
      game.cards.where(location: "deck").count.should eq(21)
    end
  end

  describe "#harm" do
    it "gives n-1 tokens" do
      game.harm(3, white, false)
      white.damage_tokens.count.should eq(2)
    end

    it "affects damage" do
      expect {game.harm(2, white, false)}.to change{ white.damage}
    end

    it "can give a fake token" do
      expect{ game.harm(2, white, true) }.not_to change{ white.damage }
    end

    it "refreshes its tokens" do
      game.harm(29, white, false)
      game.harm(5, white, false)
      game.damage_tokens.count.should eq(60)
    end
  end

  describe "#game_over" do
    context "on quit" do
      before { game.game_over(white.user) }

      its(:result)    {should eq("quit") }
      its(:winner_id) {should eq(black.user_id) }
      its(:loser_id)  {should eq(white.user_id) }
    end

    context "on destroy" do
      before do
        game.damage_tokens.each do |token|
          token.update_attributes(player_id: white.id)
        end
        game.game_over(white.user)
      end

      its(:result)    {should eq("black_victory") }
      its(:winner_id) {should eq(black.user_id) }
      its(:loser_id)  {should eq(white.user_id) }
    end
  end


  describe "#resolve_all_actions" do
    context "overheating" do
      before do
        white.cards[0..1].each do |card|
          card.update_attributes(
            location: "action", action_type: "feint")
        end
        black.cards[0].update_attributes(
          location: "action", action_type: "feint")
      end

      it "harms on double action" do
        expect{ game.resolve_all_actions }.to change{ white.damage }
      end

      it "doesn't harm on single action" do
        expect{ game.resolve_all_actions }.not_to change{ black.damage }
      end
    end

    context "single moves" do
      before do
        white.cards[0].update_attributes(location: "action", action_type: "move")
        black.cards[0].update_attributes(location: "action", action_type: "feint")
      end

      it "discards action cards" do
        expect{game.resolve_all_actions}.to change{
          white.cards.where(location: "action").count
        }.to(0)
      end

      context "true move" do
        it "creates a new tank" do
          expect{game.resolve_all_actions}.to change{ white.tanks.count }
        end

        it "makes original tank a fake" do
          expect{game.resolve_all_actions}.to change{
            white.tanks.find_by_position(2).fake
          }
        end

        it "makes the new tank real" do
          game.resolve_all_actions
          white.tanks.find_by_position([1,3]).fake.should eq(false)
        end
      end

      context "feint" do
        it "creates a new tank" do
          expect{game.resolve_all_actions}.to change{ black.tanks.count }
        end

        it "keeps original tank real" do
          expect{game.resolve_all_actions}.not_to change{
            black.tanks.find_by_position(2).fake }
        end

        it "makes the new tank a fake" do
          game.resolve_all_actions
          black.tanks.find_by_position([1,3]).fake.should eq(true)
        end
      end
    end

    context "single shots" do
      before do
        players.each do |player|
          [1,3].each do |i|
            player.tanks << Tank.create(game_id: game.id, fake: true, position: i)
          end
        end
      end

      context "general" do
        before do
          white.cards[0].update_attributes(
            location: "action", action_type: "shot", value: 2)
        end

        it "discards action cards" do
          expect{game.resolve_all_actions}.to change{
            white.cards.where(location: "action").count }.to(0)
        end

        it "removes own out-of-firing-range decoys" do
          expect{game.resolve_all_actions}.to change{ white.tanks.find_by_position(1) }
        end
      end

      context "firing on a tank" do
        before do
          white.cards[0].update_attributes(
            location: "action", action_type: "shot", value: 2)
        end

        it "deals damage" do
          expect{game.resolve_all_actions}.to change{ black.damage }
        end

        it "removes enemy decoys" do
          expect{game.resolve_all_actions}.to change{ black.tanks.count }.from(3).to(1)
        end
      end

      context "firing on a decoy" do
        before do
          black.cards[0].update_attributes(
            location: "action", action_type: "shot", value: 3)
        end

        it "doesn't deal damage" do
          expect{game.resolve_all_actions}.not_to change{ white.damage }
        end

        it "removes the targeted decoy" do
          expect{game.resolve_all_actions}.to change{ white.tanks.find_by_position(3) }
        end
      end
    end

    context "moving up and back at a boundary" do
      before do
        white.tanks.first.update_attributes(position: 3)
        white.cards[0..1].each do |card|
          card.update_attributes(
            location: "action", action_type: "move")
        end
      end

      context "card order is forward-back" do
        it "goes back then forward" do
          white.cards[0].dir = "forward"
          white.cards[1].dir = "back"

          game.resolve_all_actions
          white.tanks.first.position.should eq(3)
        end
      end

      context "card order is back-forward" do
        it "goes back then forward" do
          white.cards[0].dir = "back"
          white.cards[1].dir = "forward"

          game.resolve_all_actions
          white.tanks.first.position.should eq(3)
        end
      end
    end

    context "move and shot timing" do
      before do
        white.cards[0].update_attributes(
          location: "action", action_type: "move", dir: "forward")
        black.cards[0].update_attributes(
          location: "action", action_type: "shot")
      end

      it "lets white avoid black's shot" do
        black.cards[0].update_attributes(value: 2)
        expect{game.resolve_all_actions}.not_to change{ white.damage }
      end

      it "lets white run into black's shot" do
        black.cards[0].update_attributes(value: 3)
        expect{game.resolve_all_actions}.to change{ white.damage }
      end

      it "lets black move into position and fire at white" do
        black.tanks.first.update_attributes(position: 1)
        black.cards[0].update_attributes(value: 2)
        black.cards[1].update_attributes(
          location: "action", action_type: "move", dir: "forward")
        white.cards[0].update_attributes(action_type: "feint")

        expect{game.resolve_all_actions}.to change { white.damage }
      end
    end

    context "double shots on decoy/real tank" do
      before do
        [1,3].each do |i|
          white.tanks << Tank.create(game_id: game.id, fake: true, position: i)
        end
        [0,1].each do |i|
           black.cards[i].update_attributes(
              location: "action", action_type: "shot", value: i+2)
        end
      end

      it "eliminates non-targeted decoy" do
        expect{game.resolve_all_actions}.to change{
          white.tanks.find_by_position(1)}
      end

      it "doesn't eliminate targeted decoy" do
        pending "corner case that conflicts with current timing implementation"
        expect{game.resolve_all_actions}.not_to change{
          white.tanks.find_by_position(3)
        }
      end
    end
  end
end
