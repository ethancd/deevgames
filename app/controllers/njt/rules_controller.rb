class Njt::RulesController < ApplicationController

  def show
    @rule = Rule.where(game: "njt").find(params[:id])
  end

end