class Player < ActiveRecord::Base
  LEGAL_SHOTS = {1 => [3], 2 => [2,3], 3 => [1,2,3] }
  attr_accessible :game_id, :user_id, :ready

  belongs_to :game
  belongs_to :user

  has_many :tanks
  has_many :cards
  has_many :damage_tokens

  validates :game, :user, presence: true

  def damage
    self.damage_tokens.where(fake: false).pluck(:value).inject(:+) || 0
  end

  def destroyed?
    self.damage >= 9
  end

  def draw(drawn)
    real = self.tanks.find_by_fake(false).position
    minimum = self.tanks.where(fake: true).pluck(:position).min || 0
    count = drawn.count
    drawn.each do |card|
      card.update_attributes(location: "hand")
    end

    self.game.harm(2, self, count <= real) if count > minimum
  end

  def play(params)
    paper_tanks = self.tanks.map do |tank|
      {position: tank.position, fake: tank.fake}
    end

    actions = params[:actions].map{ |action| action[1] }

    if loop_over(actions, paper_tanks).empty?
      actify(params[:actions].map{ |action| action[1] })
      true
    else
      #raise errors
      false
    end
  end

  def discard(trashed)
    trashed.each do |card|
      card.player_id = nil
      card.location = "discard"
      card.save!
    end
  end

  def drawify(count)
    self.game.deal(count.to_i, self)
  end

  def trashify(discards)
    return if discards.nil?

    discards.each do |_, discard|
      card = self.cards.where(location: "hand").find_by_value_and_dir(
        discard["value"].to_i, discard["dir"])
      card.location = "trashed"
      card.save!
    end
  end

  def actify(actions)
    actions.each do |action|
      card = self.cards.where(location: "hand").find_by_value_and_dir(
        action["value"].to_i, action["dir"])
      card.location = "action"
      card.action_type = action["action_type"]
      card.save!
    end
  end

  def loop_over(actions, paper_tanks)
    @actions = actions
    loop_over_shots(loop_over_moves(loop_over_moves(paper_tanks)))
  end

  def loop_over_moves(paper_tanks)
    finished_actions = []
    @actions.each do |action|
      next if action["action_type"] == "shot"
      if valid_action?(action, paper_tanks)
        paper_tanks = trial_move(action, paper_tanks)
        finished_actions << action
      end
    end
    @actions -= finished_actions
    paper_tanks
  end

  def loop_over_shots(paper_tanks)
    finished_actions = []
    @actions.each do |action|
      next unless action["action_type"] == "shot"

      if valid_action?(action, paper_tanks)
        finished_actions << action
      end
    end
    @actions -= finished_actions
    @actions
  end

  def trial_move(action, paper_tanks)
    dx = action["dir"] == "forward" ? 1 : -1
    temp_tanks = []

    paper_tanks.each do |tank|
      unless [0,4].include?(tank[:position] + dx)
        t = {position: tank[:position] + dx, fake: true}
        if action["action_type"] == "move" && !tank[:fake]
          t[:fake] = false
          tank[:fake] = true
        end
        temp_tanks << t
      end
      temp_tanks << tank
    end

    temp_tanks
  end

  def valid_action?(action, paper_tanks)
    case action["action_type"]
    when "shot" then valid_shot?(action, paper_tanks)
    when "move" then valid_move?(action, paper_tanks)
    when "feint" then valid_feint?(action, paper_tanks)
    end
  end

  def valid_shot?(action, paper_tanks)
    if LEGAL_SHOTS[action["value"].to_i].include?(paper_tanks.find{|t| !t[:fake] }[:position])
      true
    else
      #flash[:notice] ||= []
      #flash[:notice] << "That shot is out of range."
      false
    end
  end

  def valid_move?(action, paper_tanks)
    if action["dir"] == "forward" &&
        paper_tanks.find{|t| !t[:fake] && t[:position] == 3}
      #flash[:notice] ||= []
      #flash[:notice] << "Can't move further up."
      false
    elsif action["dir"] == "back" && paper_tanks.find{|t| !t[:fake] &&
        t[:position] == 1}
      #flash[:notice] ||= []
      #flash[:notice] << "Can't move further back."
      false
    else
      true
    end
  end

  def valid_feint?(action, paper_tanks)
    if action["dir"] == "forward" &&
        paper_tanks.map{|t| t[:position]}.min == 3
      #flash[:notice] ||= []
      #flash[:notice] << "Can't pretend to move further up."
      false
    elsif action["dir"] == "back" &&
        paper_tanks.map{|t| t[:position]}.max == 1
      #flash[:notice] ||= []
      #flash[:notice] << "Can't pretend to move further back."
      false
    else
      true
    end
  end

  def legal_plays
    plays = []
    paper_tanks = self.tanks.map do |tank|
      {position: tank.position, fake: tank.fake}
    end

    self.cards.each_with_index do |card, i|
      ["shot", "move", "feint"].each do |action|
        if valid_action?({"value"=> card.value, "dir"=> card.dir,
            "action_type" => "#{action}"}, paper_tanks)
          plays << {"value" => card.value, "dir" => card.dir,
            "action_type" => "#{action}", "id" => i}
        end
      end
    end

    plays
  end

  def ai_draw
    if self.tanks.count == 1
      draw(drawify(self.tanks.first.position, self), self)
    else
      real = self.tanks.find_by_fake(false).position
      fakes = self.tanks.where(fake: true).pluck(:position)
      drawn = rand < 0.5 ? real : fakes.sample
      draw(drawify(drawn, self), self)
    end
  end

  def ai_play
    # legal = false
    # if rand < 0.7 || @ai.cards.count == 1
        actify([pick_ai_action(legal_plays(self))], self)
        # legal = !!actions[0]
      # end
    # else
#       until legal
#         paper_tanks = @ai.tanks.map do |tank|
#           {position: tank.position, fake: tank.fake}
#         end
#
#         @actions = []
#         2.times{ @actions << pick_ai_action(legal_plays) }
#         actions = @actions.dup
#         next if @actions.map{|a| a["id"]}.uniq.count == 1
#
#         loop_over(paper_tanks)
#         legal = @actions.empty?
#       end
#     end
  end

  def pick_ai_action(plays)
    shots = plays.select{|p| p["action_type"] == "shot"}
    if shots.count > 0 && rand < 0.6
      action = shots.sample
    else
      action = (plays - shots).sample
      rand < 0.8 ? action["action_type"] = "move" : action["action_type"] = "feint"
    end
    action
  end

  def ai_discard
    discard(self.cards.shuffle[3..-1], self) if self.cards.count > 3
  end
end
